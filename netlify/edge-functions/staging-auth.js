// Password-protects every deploy that isn't production (branch deploys and
// PR deploy previews) so work in progress isn't reachable at a guessable
// URL. Production and local `netlify dev` pass straight through.
//
// Credentials come from the STAGING_USER / STAGING_PASSWORD env vars on the
// Netlify site, scoped to the deploy-preview and branch-deploy contexts.
export default async (request) => {
    const context = Netlify.env.get('CONTEXT');
    if (context !== 'deploy-preview' && context !== 'branch-deploy') return;

    const user = Netlify.env.get('STAGING_USER');
    const password = Netlify.env.get('STAGING_PASSWORD');
    if (!user || !password) return;

    const header = request.headers.get('authorization') || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
        const [givenUser, ...rest] = atob(encoded).split(':');
        if (givenUser === user && rest.join(':') === password) return;
    }

    return new Response('Authentication required', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Speech Count staging", charset="UTF-8"',
            'Cache-Control': 'no-store',
        },
    });
};
