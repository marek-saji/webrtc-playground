/* global io */
/* eslint-disable no-console */

const url = new URL(window.location);

const clientName = url.searchParams.get('name');
const room = url.searchParams.get('room');

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

socket.on('enters', (payload) => {
    console.debug('Other client entered', payload);
});

socket.on('leaves', (payload) => {
    console.debug('Other client left', payload);
});

socket.on('kick', (payload) => {
    console.log('Kicked out by', payload);
    socket.disconnect();
});

socket.on('disconnect', () => {
    console.log('Disconnected');
    console.groupEnd('Connected');
});

socket.on('message', (...argv) => {
    console.debug('Message', ...argv);
});
