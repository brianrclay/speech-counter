const fs = require('node:fs');
const path = require('node:path');

// Netlify's HTML processing can turn file links into clean URLs. Capacitor
// treats extensionless URLs as SPA routes and serves index.html for every one.
function prepareNativeLinks(directory) {
    const pages = new Set(fs.readdirSync(directory).filter(name => name.endsWith('.html')));
    for (const page of pages) {
        const file = path.join(directory, page);
        const html = fs.readFileSync(file, 'utf8').replace(/\bhref\s*=\s*(["'])([^"']*)\1/gi, (attribute, quote, href) => {
            if (!href.startsWith('/') || href.startsWith('//')) return attribute;
            const match = href.match(/^\/([^?#]*)(.*)$/);
            const name = match[1].replace(/\/$/, '');
            const target = name ? `${name}.html` : 'index.html';
            return pages.has(target) ? `href=${quote}./${target}${match[2]}${quote}` : attribute;
        });
        fs.writeFileSync(file, html);
    }
}

module.exports = { prepareNativeLinks };
if (require.main === module) {
    if (!process.argv[2]) throw new Error('Pass the assembled native asset directory');
    prepareNativeLinks(path.resolve(process.argv[2]));
}
