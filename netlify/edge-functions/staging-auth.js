// Password-protects every deploy that isn't production (branch deploys and
// PR deploy previews) so work in progress isn't reachable at a guessable
// URL. Production and local `netlify dev` pass straight through.
//
// Credentials come from the STAGING_USER / STAGING_PASSWORD env vars on the
// Netlify site, scoped to the deploy-preview and branch-deploy contexts.
export default async (request, context) => {
    // CONTEXT is a build-time variable and isn't visible to edge functions at
    // runtime; the deploy context comes from the handler's context object.
    const deployContext = context.deploy && context.deploy.context;
    if (deployContext !== 'deploy-preview' && deployContext !== 'branch-deploy') return;

    const user = Netlify.env.get('STAGING_USER');
    const password = Netlify.env.get('STAGING_PASSWORD');
    if (!user || !password) {
        return new Response('Staging credentials are not configured', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }

    // A header that isn't valid base64 (some browsers send odd partial
    // credentials) counts as no credentials rather than crashing the function.
    const header = request.headers.get('authorization') || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
        let decoded = '';
        try {
            decoded = atob(encoded);
        } catch (err) {
            decoded = '';
        }
        const [givenUser, ...rest] = decoded.split(':');
        if (decoded && givenUser === user && rest.join(':') === password) return;
    }

    return new Response('Authentication required', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="Speech Count staging", charset="UTF-8"',
            'Cache-Control': 'no-store',
        },
    });
};
