const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/pages-deployment.yml'),'utf8');

assert.match(workflow,/push:\s*\n\s+branches:\s*\n\s+- main/,'main pushes trigger Pages deployment');
assert.match(workflow,/pull_request:/,'pull requests validate the Pages artifact');
assert.match(workflow,/workflow_dispatch:/,'Pages deployment can be started manually');
assert.match(workflow,/group: github-pages\s*\n\s+cancel-in-progress: true/,'new main deployments supersede stale Pages work');
assert.match(workflow,/uses: actions\/upload-pages-artifact@v4\s*\n\s+with:\s*\n\s+path: \./,'repository root is the explicit Pages artifact source');
assert.match(workflow,/test -f admin\.js[\s\S]*test -f admin\.css[\s\S]*test -f admin\/index\.html/,'administrator assets are required before upload');
assert.match(workflow,/github\.ref == 'refs\/heads\/main'/,'only main can deploy the artifact');
assert.match(workflow,/pages: write[\s\S]*id-token: write/,'deployment has the minimum Pages permissions');
assert.match(workflow,/needs: build/,'deployment cannot run before the artifact build');
assert.match(workflow,/uses: actions\/configure-pages@v5/,'Pages metadata is configured explicitly');
assert.match(workflow,/uses: actions\/deploy-pages@v4/,'the official Pages deployment action activates the artifact');

console.log('explicit root Pages build, administrator asset guard, and main-only deployment passed');
