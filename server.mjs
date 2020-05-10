import { createServer } from 'http';
import { join as joinPath, dirname } from 'path';
import { fileURLToPath } from 'url';

import nodeStatic from 'node-static';
import socketIO from 'socket.io';


const PORT = process.env.PORT || 5000;
const DIR = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = joinPath(DIR, 'static');

const ROOM_SIZE_LIMIT = 2;


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
class Client
{
    constructor (socket)
    {
        this[SOCKET] = socket;
    }

    get descriptor ()
    {
        return {
            clientId: this.id,
            clientName: this.name,
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

const clients = new Map();

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
        broadcast('leaves', client.descriptor);
        clients.delete(client.id);
    });

    socket.on('hello', (payload) => {
        client.name = payload.clientName;

        // eslint-disable-next-line no-constant-condition
        while (true)
        {
            const roomClients =
            socket.adapter.rooms[payload.room] || { length: 0 };
            if (roomClients.length < ROOM_SIZE_LIMIT)
            {
                break;
            }
            const clientToKickOut = clients.get(
                Object.keys(roomClients.sockets || {})[0],
            );
            clientToKickOut.room = null;
            clientToKickOut.socket.emit('kick', client.descriptor);
        }

        client.room = payload.room;
        emit('hello', client.descriptor);
        broadcast('enters', client.descriptor);
    });

    socket.on('log', logClient);
});


logServer({}, 'Serving', STATIC_DIR, 'on', `http://[::1]:${PORT}`);
