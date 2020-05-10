import { createServer } from 'http';
import { join as joinPath, dirname } from 'path';
import { fileURLToPath } from 'url';

import nodeStatic from 'node-static';
import socketIO from 'socket.io';


const PORT = process.env.PORT || 5000;
const DIR = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = joinPath(DIR, 'static');


// Logging

function log (context, { clientId, clientName, room }, ...argv)
{
    const humanReadableContext = [
        context,
        clientName || null,
        room ? `in #${room}` : null,
        `(${clientId})`,
    ].filter((a) => a != null).join(' ');
    const prettyContext = `[0;34m[${humanReadableContext}][0;0m`;
    // eslint-disable-next-line no-console
    console.log(prettyContext, ...argv);
}

const logServer = log.bind(null, 'SERVER');


// Static server

const fileServer = new (nodeStatic.Server)(STATIC_DIR);
const app = createServer((req, res) => {
    req.addListener('end', () => {
        fileServer.serve(req, res);
    }).resume();
}).listen(PORT);


// Sockets

const io = socketIO.listen(app);
io.sockets.on('connection', (socket) => {
    const clientId = socket.id;
    let clientName;
    let room;
    const logClient = (...argv) => log('CLIENT', { clientId, clientName, room }, ...argv);

    logServer({ clientId }, 'connected');

    socket.on('disconnect', () => {
        logServer({ clientId, clientName, room }, 'disconnected');
        socket.broadcast.in(room).emit('leaves', { clientName });
    });

    socket.on('hello', (payload) => {
        clientName = payload.clientName;
        room = payload.room;
        socket.join(room);
        socket.emit('hello', { clientName, room });
        socket.broadcast.in(room).emit('enters', { clientName });
    });

    socket.on('log', logClient);
});


logServer({}, 'Serving', STATIC_DIR, 'on', `http://[::1]:${PORT}`);
