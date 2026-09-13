import fs from 'node:fs';
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requested =
  process.env.RELEASE_VERSION || process.env.GITHUB_REF_NAME?.replace(/^v/, '') || version;
if (!/^\d+\.\d+\.\d+$/.test(requested) || requested !== version)
  throw new Error('Release version must match package.json exactly.');
if (!fs.readFileSync('server.js', 'utf8').includes(`'${version}'`))
  throw new Error('Backend version does not match the release.');
if (!fs.readFileSync('Dockerfile', 'utf8').includes(`"${version}"`))
  throw new Error('Docker version does not match the release.');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`Release version validated: ${version}`);
