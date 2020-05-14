/* global io */
/* eslint-disable no-console */

const url = new URL(window.location);

const room = url.searchParams.get('room');
const clientName = url.searchParams.get('name');

if (!clientName || !room)
{
    url.searchParams.set('room', 'general');
    // eslint-disable-next-line no-alert
    url.searchParams.set('name', prompt('Who are you?'));
    window.location = url;

    // Cheap way to stop the script.
    throw new Error('BYE');
}

const rtcConfig = {
    iceServers: [
        // { 'urls': 'stun:stun.l.google.com:19302' }
        { urls: 'stun:stun.stunprotocol.org:3478' },
        // https://gist.github.com/zziuni/3741933
    ],
};

const peers = new Map();
window.peers = peers; // DEBUG

window.title = `${clientName}, #${room}`;
document.getElementById('clientName').textContent = clientName;

const socket = io.connect();

function updateClientList (clients)
{
    document.getElementById('clientList').textContent =
        clients
            .map((client) => client.name)
            .join(', ');
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
        console.debug('ICE candidate', candidate);
        socket.emit('ice-candidate', {
            to: id,
            candidate,
        });
    };

    const dataChannel = connection.createDataChannel('test');
    dataChannel.onopen = () => {
        console.debug(`Opened data channel with ${id}`);
    };
    dataChannel.onclose = () => {
        console.debug(`Closed data channel with ${id}`);
    };
    dataChannel.onmessage = (event) => {
        console.debug(`Message on data channel from ${id}`, event);
    };

    connection.createOffer(
        (offer) => {
            connection.setLocalDescription(offer, () => {
                socket.emit('offer', {
                    to: id,
                    offer,
                });
            });
        },
        (error) => {
            console.error('Failed to create offer:', error);
        },
    );

    return { connection, dataChannel };
}

function pruneOldPeers (newClientIds)
{
    Array.from(peers.keys())
        .filter((id) => id !== socket.id)
        .filter((id) => !newClientIds.includes(id))
        .forEach((id) => {
            // TODO Clean up?
            peers.delete(id);
        });
}

function addNewPeers (newClientIds)
{
    newClientIds
        .filter((id) => id !== socket.id)
        .filter((id) => !peers.has(id))
        .forEach((id) => {
            const { connection, dataChannel } = connectPeer(id);
            peers.set(id, {
                client: { id }, // FIXME
                connection,
                dataChannel,
            });
        });
}

function syncPeers (clientIds)
{
    pruneOldPeers(clientIds);
    addNewPeers(clientIds);
}

socket.on('connect', () => {
    console.group('Connected');
    socket.emit('hello', { clientName, room });
    socket.emit('log', 'Hello');
});

socket.on('hello', (payload) => {
    console.log('Hello', payload);
    updateClientList(payload.room.clients);
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
    updateClientList(clients);
    const clientIds = clients.map((client) => client.id);
    syncPeers(clientIds);
    console.debug('Sync up (end)', peers);
});

socket.on('offer', ({ from, offer }) => {
    console.debug('Offer', from, offer);
    const peer = peers.get(from) || { client: { from } };
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
        console.debug('ICE candidate', candidate);
        socket.emit('ice-candidate', {
            to: from,
            candidate,
        });
    };

    connection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        peer.dataChannel = dataChannel;
        dataChannel.onopen = () => {
            console.debug(`Opened data channel with ${from}`);
        };
        dataChannel.onclose = () => {
            console.debug(`Closed data channel with ${from}`);
        };
        dataChannel.onmessage = (messageEvent) => {
            console.debug(`Message on data channel from ${from}`, messageEvent);
        };
    };

    connection.setRemoteDescription(
        new RTCSessionDescription(offer),
        () => {
            console.debug(`Set remote descriptor for ${from}`);
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
        },
        (error) => {
            console.error(`Failed to create answer for ${from}:`, error);
        },
    );

    peer.connection = connection;
    console.log(peers);
});

socket.on('answer', ({ from, answer }) => {
    console.debug('Answer', from, answer);
    const peer = peers.get(from);
    peer.connection.setRemoteDescription(
        new RTCSessionDescription(answer),
        () => {
            console.debug(`Set remote descriptor for ${from}`);
        },
        (error) => {
            console.error(`Failed to set remote descriptor for ${from}:`, error);
        },
    );
});

socket.on('ice-candidate', ({ from, candidate }) => {
    console.debug(`Remote ICE candidate from ${from}`, from, candidate);
    const peer = peers.get(from);
    try
    {
        peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
        console.debug(`Set remote ICE Candidate from ${from}.`);
    }
    catch (error)
    {
        console.error(`Failed to add ICE candidate from ${from}:`, error);
    }
});
