/* global io */
/* eslint-disable no-console */

const url = new URL(window.location);

const room = url.searchParams.get('room');
const clientName = url.searchParams.get('name');

if (!clientName || !room)
{
    url.searchParams.set('room', room || 'general');
    // eslint-disable-next-line no-alert
    url.searchParams.set('name', clientName || prompt('Who are you?'));
    window.location = url;

    // Cheap way to stop the script.
    throw new Error('BYE');
}

document.getElementById('new-client-link').href = (() => {
    const sp = new URLSearchParams(url.searchParams);
    sp.delete('name');
    return `?${sp}`;
})();

const rtcConfig = {
    iceServers: [
        // { urls: 'stun:stun.stunprotocol.org:3478' },
        // { urls: 'stun:stun.l.google.com:19302' }
        // https://gist.github.com/zziuni/3741933
    ],
    configuration: {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
    },
};

const peers = new Map();

document.title = `${clientName}, #${room}`;
document.getElementById('clientName').textContent = clientName;

const socket = io.connect();

function updateClientList ()
{
    const listElement = document.getElementById('people-list');
    if (peers.size === 0)
    {
        listElement.textContent = 'There’s noone here.';
        return;
    }

    const itemTpl = document.getElementById('people-list-item-tpl');
    listElement.textContent = '';
    peers.forEach((peer) => {
        const item = document.importNode(itemTpl.content, true);
        item.querySelector('[name="name"]').textContent = peer.client.name;
        item.querySelector('[name="connection"]').textContent = peer.connection ? '✔' : '❌';
        item.querySelector('[name="data-channel"]').textContent = peer.dataChannel ? '✔' : '❌';

        const transcript = item.querySelector('[name="chat-transcript"]');
        transcript.setAttribute('data-client-id', peer.client.id);
        item.querySelector('[name="chat-form"]').addEventListener('submit', (event) => {
            event.preventDefault();
            const input = event.currentTarget.querySelector('[name="input"]');
            const { value } = input;
            peer.dataChannel.send(value);
            transcript.textContent += `\n you: ${value}`;
            input.value = '';
            input.focus();
        });

        item.querySelector('[name="there"]').setAttribute('data-client-id', peer.client.id);
        const hereVideo = item.querySelector('[name="here"]');
        item.querySelector('[name="call"]').addEventListener('click', async () => {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            hereVideo.srcObject = stream;
            hereVideo.play();
            try
            {
                // peer.connection.addStream(stream);
                await stream.getTracks().map(async (track) => {
                    peer.connection.addTrack(track, stream);
                });
            }
            catch (error)
            {
                console.error(error);
            }
        });

        listElement.appendChild(item);
    });
}

function onDataChannelMessage (clientId, event)
{
    document.querySelector(`output[data-client-id="${clientId}"]`).textContent += `\nthem: ${event.data}`;
}

// FIXME No callback hell, please
function connectPeer (id)
{
    const connection = new RTCPeerConnection(rtcConfig);

    connection.onicecandidate = (event) => {
        const eventCandidate = event.candidate;
        if (!eventCandidate)
        {
            return;
        }
        const candidate = {
            sdpMLineIndex: eventCandidate.sdpMLineIndex,
            sdpMid: eventCandidate.sdpMid,
            candidate: eventCandidate.candidate,
        };
        // console.debug('ICE candidate', candidate);
        socket.emit('ice-candidate', {
            to: id,
            candidate,
        });
        updateClientList();
    };

    // connection.onaddstream = (event) => {
    //     console.log(`Stream from ${id}:`, event);
    // };
    connection.ontrack = (event) => {
        console.log(`Track from ${id}:`, event);
        const thereVideo = document.querySelector(`video[data-client-id="${id}"]`);
        if (event.streams && event.streams[0])
        {
            thereVideo.srcObject = event.streams[0];
        }
        else
        {
            thereVideo.srcObject = new MediaStream(event.track);
        }
        thereVideo.play();
        return false;
    };

    // const dataChannel = null;
    const dataChannel = connection.createDataChannel('test');
    dataChannel.onopen = () => {
        console.debug(`Opened data channel with ${id}`);
    };
    dataChannel.onclose = () => {
        console.debug(`Closed data channel with ${id}`);
    };
    dataChannel.onmessage = (event) => {
        console.debug(`Message on data channel from ${id}`, event);
        onDataChannelMessage(id, event);
    };

    connection.createOffer(
        (offer) => {
            connection.setLocalDescription(offer, () => {
                socket.emit('offer', {
                    to: id,
                    offer,
                });
            });
            updateClientList();
        },
        (error) => {
            console.error('Failed to create offer:', error);
        },
    );

    return { connection, dataChannel };
}

function pruneOldPeers (newClients)
{
    const newClientIds = newClients.map(({ id }) => id);

    Array.from(peers.keys())
        .filter((id) => id !== socket.id)
        .filter((id) => !newClientIds.includes(id))
        .forEach((id) => {
            // TODO Clean up?
            peers.delete(id);
        });
}

function addNewPeers (newClients)
{
    newClients
        .filter(({ id }) => id !== socket.id)
        .filter(({ id }) => !peers.has(id))
        .forEach((client) => {
            peers.set(client.id, {
                client,
            });
        });
}

function connectPeers ()
{
    Array.from(peers.values())
        .filter((peer) => !peer.connection)
        .forEach((peer) => {
            const { connection, dataChannel } =
                connectPeer(peer.client.id);
            // eslint-disable-next-line no-param-reassign
            peer.connection = connection;
            // eslint-disable-next-line no-param-reassign
            peer.dataChannel = dataChannel;
        });
}

function syncPeers (clients)
{
    pruneOldPeers(clients);
    addNewPeers(clients);
    updateClientList();
}

socket.on('connect', () => {
    console.group('Connected');
    socket.emit('hello', { clientName, room });
    socket.emit('log', 'Hello');
});

socket.on('hello', (payload) => {
    console.log('Hello', payload);
    syncPeers(payload.room.clients);
    updateClientList();
});

socket.on('disconnect', () => {
    console.log('Disconnected');
    console.groupEnd('Connected');
});

socket.on('message', (...argv) => {
    console.debug('Message', ...argv);
});

socket.on('sync-up', (payload) => {
    console.debug('Sync up', payload);
    const { clients } = payload.room;
    updateClientList();
    syncPeers(clients);
    connectPeers();
    console.debug('Sync up (end)', peers);
});

socket.on('offer', ({ from, offer }) => {
    console.debug('Offer', from, offer);
    const peer = peers.get(from) || { client: { id: from } };
    peers.set(from, peer);

    const connection = new RTCPeerConnection(rtcConfig);

    connection.onicecandidate = (event) => {
        const eventCandidate = event.candidate;
        if (!eventCandidate)
        {
            return;
        }
        const candidate = {
            sdpMLineIndex: eventCandidate.sdpMLineIndex,
            sdpMid: eventCandidate.sdpMid,
            candidate: eventCandidate.candidate,
        };
        // console.debug('ICE candidate', candidate);
        socket.emit('ice-candidate', {
            to: from,
            candidate,
        });
        updateClientList();
    };

    // connection.onaddstream = (event) => {
    //     console.log(`Stream from ${from}:`, event);
    // };
    connection.ontrack = (event) => {
        console.log(`Track from ${from}:`, event);
        const thereVideo = document.querySelector(`video[data-client-id="${from}"]`);
        if (event.streams && event.streams[0])
        {
            thereVideo.srcObject = event.streams[0];
        }
        else
        {
            thereVideo.srcObject = new MediaStream(event.track);
        }
        thereVideo.play();
        return false;
    };

    connection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        peer.dataChannel = dataChannel;
        dataChannel.onopen = () => {
            console.debug(`Opened data channel with ${from}`);
            updateClientList();
        };
        dataChannel.onclose = () => {
            console.debug(`Closed data channel with ${from}`);
            updateClientList();
        };
        dataChannel.onmessage = (messageEvent) => {
            console.debug(`Message on data channel from ${from}`, messageEvent);
            onDataChannelMessage(from, messageEvent);
        };
    };

    connection.setRemoteDescription(
        new RTCSessionDescription(offer),
        () => {
            console.debug(`Set remote descriptor for ${from}`);
            updateClientList();
        },
        (error) => {
            console.error(`Failed to set remote descriptor for ${from}:`, error);
        },
    );

    connection.createAnswer(
        (answer) => {
            connection.setLocalDescription(answer);
            socket.emit('answer', {
                to: from,
                answer,
            });
            updateClientList();
        },
        (error) => {
            console.error(`Failed to create answer for ${from}:`, error);
        },
    );

    peer.connection = connection;
    updateClientList();
});

socket.on('answer', ({ from, answer }) => {
    console.debug('Answer', from, answer);
    const peer = peers.get(from);
    peer.connection.setRemoteDescription(
        new RTCSessionDescription(answer),
        () => {
            console.debug(`Set remote descriptor for ${from}`);
            updateClientList();
        },
        (error) => {
            console.error(`Failed to set remote descriptor for ${from}:`, error);
        },
    );
    updateClientList();
});

socket.on('ice-candidate', ({ from, candidate }) => {
    // console.debug(`Remote ICE candidate from ${from}`, from, candidate);
    const peer = peers.get(from);
    try
    {
        peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
        // console.debug(`Set remote ICE Candidate from ${from}.`);
        updateClientList();
    }
    catch (error)
    {
        console.error(`Failed to add ICE candidate from ${from}:`, error);
    }
    updateClientList();
});
