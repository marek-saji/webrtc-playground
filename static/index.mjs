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

function updateClientList (clients)
{
    document.getElementById('clientList').textContent =
        clients
            .map((client) => client.name)
            .join(', ');
}

window.title = `${clientName}, #${room}`;
document.getElementById('clientName').textContent = clientName;

const socket = io.connect();

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
    updateClientList(payload.room.clients);
});
