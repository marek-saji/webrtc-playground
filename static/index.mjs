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
}
else
{
    const socket = io.connect();
    window.socket = socket; // DEBUG

    socket.on('connect', () => {
        console.group('Connected');
        socket.emit('hello', { clientName, room });
        socket.emit('log', 'Hello');
    });

    socket.on('hello', (payload) => {
        console.log('Hello', payload);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected');
        console.groupEnd('Connected');
    });

    socket.on('message', (...argv) => {
        console.debug('Message', ...argv);
    });

    socket.on('sync-up', (roomDescriptor) => {
        console.log(roomDescriptor);
    });
}
