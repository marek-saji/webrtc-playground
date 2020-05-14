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

const SOCKET = 'socket';
const NAME = Symbol('name');
const ROOM = Symbol('room');

const clients = new Map();

class Client
{
    constructor (socket)
    {
        this[SOCKET] = socket;
    }

    get descriptor ()
    {
        return {
            id: this.id,
            name: this.name,
            room: this.room,
        };
    }

    get id ()
    {
        return this[SOCKET].id;
    }

    set name (name)
    {
        this[NAME] = name;
    }

    get name ()
    {
        return this[NAME];
    }

    set room (name)
    {
        if (this[ROOM])
        {
            this[SOCKET].leave(this[ROOM]);
        }

        if (name)
        {
            this[SOCKET].join(name);
            this[ROOM] = name;
        }
    }

    get room ()
    {
        return this[ROOM];
    }
}

function getRoomDescriptor (socket, roomName)
{
    const roomDescriptor = {};

    const roomClients = socket.adapter.rooms[roomName] || [];
    const roomClientSockets =
        roomClients.length
            ? Object.keys(roomClients.sockets)
            : [];

    roomDescriptor.clients = roomClientSockets.map(
        (id) => clients.get(id).descriptor,
    );

    return roomDescriptor;
}

const io = socketIO.listen(app);
io.sockets.on('connection', (socket) => {
    const client = new Client(socket);
    clients.set(client.id, client);

    const emit = (...argv) => socket
        .emit(...argv);
    const broadcast = (...argv) => socket.in(client.room)
        .broadcast.emit(...argv);

    const clientId = socket.id;
    const logClient = (...argv) => log('CLIENT', client.descriptor, ...argv);

    logServer({ clientId }, 'connected');

    socket.on('disconnect', () => {
        logServer(client.descriptor, 'disconnected');
        clients.delete(client.id);
        broadcast('sync-up', { room: getRoomDescriptor(socket, client.room) });
    });

    socket.on('hello', (payload) => {
        client.name = payload.clientName;
        client.room = payload.room;
        const roomDescriptor = getRoomDescriptor(socket, client.room);
        emit('hello', { you: client.descriptor, room: roomDescriptor });
        broadcast('sync-up', { room: roomDescriptor });
    });

    socket.on('log', logClient);
});


logServer({}, 'Serving', STATIC_DIR, 'on', `http://[::1]:${PORT}`);
