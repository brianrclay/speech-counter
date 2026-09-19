const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'www');
const port = 8743;

const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
    let pathname;
    try {
        pathname = decodeURIComponent(req.url.split('?')[0]);
    } catch (err) {
        res.writeHead(400);
        res.end('Bad request');
        return;
    }
    let filePath = path.normalize(path.join(root, pathname));
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }
    if (filePath.endsWith(path.sep) || filePath === root) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(port, '127.0.0.1', () => console.log(`Serving www/ at http://localhost:${port}`));
