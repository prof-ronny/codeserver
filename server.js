// server.js — host ports no formato 9{ID}{S}, com ID incremental 00–99 e S=0..9
const express = require('express');
const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const Docker = require('dockerode');
const docker = new Docker();

const app = express();
const PORT = 5000;

const TURMA = 'TESTE';
const BASE_PATH = '/home/ronny/projects/' + TURMA;

// Tag da imagem
const IMAGE_TAG = 'code-server-dev:ptbr';

// portas internas do container (padrão)
const IN_CODE = 8080; // S=0
const IN_WEB0 = 8081; // S=1..9 => 8081..8089

// ID incremental (00–99). Começa em 0.
let nextId2 = 0;

const containerRegistry = {}; // { [name]: { id2:number, code:number, web:number[] } }
const { posix: pathPosix } = path;

// -------- resource limits (fixos) --------
const MEM_LIMIT   = '1g';   // RAM máxima
const MEM_SWAP    = '3g';   // swap total (igual = sem swap extra) | "-1" = ilimitada
const CPU_LIMIT   = '1.5';    // total de vCPUs
const CPU_SHARES  = '512';    // prioridade relativa (padrão 1024)

// -------- utils --------
function slugify(t) { return t.replace(/[^a-z0-9]/gi,'-').toLowerCase(); }
function portsFromId(id2){
  const idStr = String(id2).padStart(2,'0');
  const mk = s => Number(`9${idStr}${s}`);
  return { code: mk(0), web: Array.from({length:9},(_,i)=> mk(i+1)) };
}
function isPortFree(port){
  return new Promise(resolve=>{
    const s = net.createServer()
      .once('error', ()=>resolve(false))
      .once('listening', ()=>s.close(()=>resolve(true)))
      .listen(port,'0.0.0.0');
  });
}
async function reserveNextIdBlock(){
  for (let i=0;i<100;i++){
    const id2 = (nextId2 + i) % 100;
    const { code, web } = portsFromId(id2);
    const all = [code, ...web];
    let ok = true;
    for (const p of all){
      if (!(await isPortFree(p))) { ok = false; break; }
    }
    if (ok){ nextId2 = (id2 + 1) % 100; return { id2, code, web }; }
  }
  throw new Error('Sem bloco de portas livre (9{ID}{S}).');
}
function resolveRedirectHost(req){
  const xf = (req.headers['x-forwarded-host']||'').split(',')[0].trim();
  if (xf) return xf.split(':')[0];
  const h = (req.headers.host||'').split(',')[0].trim();
  return h.split(':')[0];
}
function getPublishedPort(name, cPort){
  return new Promise(r=>{
    const fmt = `{{(index (index .NetworkSettings.Ports "${cPort}/tcp") 0).HostPort}}`;
    exec(`docker inspect -f '${fmt}' ${name}`, (e, out)=>{
      if (e) return r(null);
      const p = parseInt((out||'').trim(),10);
      r(Number.isFinite(p) ? p : null);
    });
  });
}
let sockGid = null;
try { sockGid = fs.statSync('/var/run/docker.sock').gid; } catch {}

// Git identidade fake (pode fixar valores se quiser)
function makeGitIdentity(usuario){
  const domain = 'fatec.sp.gov.br';
  const name  = usuario;
  const local = (usuario||'').toLowerCase().trim().replace(/\s+/g,'.').replace(/[^a-z0-9._-]/g,'');
  const email = `${local}@${domain}`;
  return { name, email };
}

// Garante volume
function ensureVolume(name){
  try { execSync(`docker volume create ${name}`, { stdio: 'ignore' }); } catch {}
}

// -------- rotas --------
app.get('/:usuario/:projeto', async (req, res) => {
  const { usuario, projeto } = req.params;
  const slug = slugify(`${usuario}-${projeto}`);
  const name = `code-${slug}`;

  const folderPath = pathPosix.join(BASE_PATH, projeto ,usuario );
  fs.mkdirSync(folderPath, { recursive: true });

  if (containerRegistry[name]?.code){
    const host = resolveRedirectHost(req);
    return res.redirect(`http://${host}:${containerRegistry[name].code}/?locale=pt-br`);
  }

  exec(`docker ps -a --filter "name=${name}" --format "{{.Names}}"`, async (err, out) => {
    const exists = (out||'').includes(name);

    if (exists){
      const codePort = await getPublishedPort(name, IN_CODE);
      if (!codePort) return res.status(500).send('Container existente sem porta publicada.');
      const webPorts = [];
      for (let i=0;i<9;i++) webPorts[i] = await getPublishedPort(name, IN_WEB0 + i);
      containerRegistry[name] = { id2: null, code: codePort, web: webPorts };
      exec(`docker start ${name}`, ()=> {
        const host = resolveRedirectHost(req);
        res.redirect(`http://${host}:${codePort}/?locale=pt-br`);
      });
      return;
    }

    let id2, codePort, webPorts;
    try {
      const blk = await reserveNextIdBlock();
      id2 = blk.id2; codePort = blk.code; webPorts = blk.web;
    } catch(e){
      console.error(e);
      return res.status(500).send('Sem bloco de portas disponível.');
    }

    const { name: gitName, email: gitEmail } = makeGitIdentity(usuario);
    const PNPM_VOL = 'pnpm-store';
    ensureVolume(PNPM_VOL);

    const dockerArgs = [
      'run','-d',
      '--name', name,
      '-u','root',
      '-p', `${codePort}:${IN_CODE}`,
      ...webPorts.flatMap((hp, idx)=> ['-p', `${hp}:${IN_WEB0 + idx}`]),
      '-v', `${folderPath}:/home/coder/project`,
      '-v', '/var/run/docker.sock:/var/run/docker.sock',
      '-v', `${PNPM_VOL}:/pnpm-store`,
      ...(sockGid !== null ? ['--group-add', String(sockGid)] : []),

      // limites fixos
      ...(MEM_LIMIT   ? ['--memory', MEM_LIMIT]     : []),
      ...(MEM_SWAP    ? ['--memory-swap', MEM_SWAP] : []),
      ...(CPU_LIMIT   ? ['--cpus', CPU_LIMIT]       : []),
      ...(CPU_SHARES  ? ['--cpu-shares', CPU_SHARES]: []),

      '-e', `GIT_NAME=${gitName}`,
      '-e', `GIT_EMAIL=${gitEmail}`,
      '--entrypoint','bash',
      IMAGE_TAG,
      '-c',
`mkdir -p /pnpm-store && chown -R coder:coder /pnpm-store && chmod 775 /pnpm-store && \
su - coder -lc '. "$NVM_DIR/nvm.sh"; \
git config --global user.name "\${GIT_NAME}"; \
git config --global user.email "\${GIT_EMAIL}"; \
pnpm config set store-dir /pnpm-store; \
pnpm config set registry http://host.docker.internal:4873/; \
pnpm config set prefer-offline true; \
pnpm config set fetch-retries 3; \
code-server --locale pt-br --auth=none --bind-addr 0.0.0.0:${IN_CODE} /home/coder/project'`
    ];

    const p = spawn('docker', dockerArgs);
    p.stderr.on('data', d => console.error(`❌ [docker] ${d}`));
    p.stdout.on('data', d => console.log(`✅ [docker] ${d}`));
    p.on('close', code => {
      if (code !== 0) return res.status(500).send('Erro ao criar container.');
      containerRegistry[name] = { id2, code: codePort, web: webPorts };
      const host = resolveRedirectHost(req);
      res.redirect(`http://${host}:${codePort}/?locale=pt-br`);
    });
  });
});

// rotas web
app.get('/:usuario/:projeto/web', (req, res) => {
  req.params.n = '1';
  handleWebRedirect(req, res);
});
app.get('/:usuario/:projeto/web/:n', (req, res) => {
  handleWebRedirect(req, res);
});
function handleWebRedirect(req, res){
  const { usuario, projeto, n } = req.params;
  const num = Math.max(1, Math.min(9, parseInt(n,10) || 1));
  const slug = slugify(`${usuario}-${projeto}`);
  const name = `code-${slug}`;
  const info = containerRegistry[name];
  if (!info?.web?.[num-1]) return res.status(404).send('Web não publicada.');
  const host = resolveRedirectHost(req);
  return res.redirect(`http://${host}:${info.web[num-1]}`);
}

// encerramento
process.on('SIGINT', async () => {
  console.log('Encerrando containers...');
  for (const [name] of Object.entries(containerRegistry)) {
    try {
      const c = docker.getContainer(name);
      await c.stop(); await c.remove();
      console.log(`Removido: ${name}`);
    } catch (e) { console.error(`Erro removendo ${name}:`, e.message); }
  }
  process.exit();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TURMA: ${TURMA}`);
  console.log(`🌐 Servidor ouvindo em http://0.0.0.0:${PORT}`);
});
