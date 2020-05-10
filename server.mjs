import { createServer } from 'http';
import { join as joinPath, dirname } from 'path';
import { fileURLToPath } from 'url';

import nodeStatic from 'node-static';


const PORT = process.env.PORT || 5000;
const DIR = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = joinPath(DIR, 'static');


const fileServer = new (nodeStatic.Server)(STATIC_DIR);
createServer((req, res) => {
    req.addListener('end', () => {
        fileServer.serve(req, res);
    }).resume();
}).listen(PORT);

process.stdout.write(`Serving ${STATIC_DIR} on http://[::1]:${PORT}\n`);
