// server.js atualizado com spawn (Windows + Docker volume + cache npm)
const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');
const docker = new Docker();

const app = express();
const PORT = 5000;
const BASE_PORT = 9000;
const TURMA = "TAPWM";
const BASE_PATH = path.join('C:', 'codespace-server', 'meuprojetos', TURMA);
const CACHE_PATH = path.join('C:', 'codespace-server', 'npm-cache');

const containerRegistry = {};

function slugify(text) {
  return text.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

app.get('/:usuario/:projeto', (req, res) => {
  const { usuario, projeto } = req.params;
  const slug = slugify(`${usuario}-${projeto}`);
  const containerName = `code-${slug}`;
  const folderPath = path.join(BASE_PATH, usuario, projeto);

  fs.mkdirSync(folderPath, { recursive: true });
  fs.mkdirSync(CACHE_PATH, { recursive: true });

  const dockerPath = folderPath
    .replace(/\\/g, '/')
    .replace(/^([A-Z]):/, (_, drive) => `/${drive.toLowerCase()}`);

  const dockerCachePath = CACHE_PATH
    .replace(/\\/g, '/')
    .replace(/^([A-Z]):/, (_, drive) => `/${drive.toLowerCase()}`);

  if (containerRegistry[containerName]) {
    const host = req.headers.host.split(':')[0];
    return res.redirect(`http://${host}:${containerRegistry[containerName]}`);
  }

  const usedPorts = Object.values(containerRegistry);
  let assignedPort = BASE_PORT;
  while (usedPorts.includes(assignedPort)) assignedPort++;

  exec(`docker ps -a --filter "name=${containerName}" --format "{{.Names}}"`, (err, stdout) => {
    if (stdout.includes(containerName)) {
      exec(`docker start ${containerName}`, () => {
        containerRegistry[containerName] = assignedPort;
        const host = req.headers.host.split(':')[0];
        return res.redirect(`http://${host}:${assignedPort}`);
      });
    } else {
      const dockerArgs = [
        'run', '-d',
        '--name', containerName,
        '-p', `${assignedPort}:8080`,
        '-v', `${dockerPath}:/home/coder/project`,
        '-v', `${dockerCachePath}:/home/coder/npm-cache`,
        '-v', '/var/run/docker.sock:/var/run/docker.sock',
        'code-server-dev'
      ];

      const dockerProc = spawn('docker', dockerArgs);

      dockerProc.stdout.on('data', (data) => {
        console.log(`✅ [stdout] docker run: ${data}`);
      });

      dockerProc.stderr.on('data', (data) => {
        console.error(`❌ [stderr] docker run: ${data}`);
      });

      dockerProc.on('close', (code) => {
        if (code === 0) {
          containerRegistry[containerName] = assignedPort;
          const host = req.headers.host.split(':')[0];
          return res.redirect(`http://${host}:${assignedPort}`);
        } else {
          console.error(`❌ docker exited with code ${code}`);
          return res.status(500).send('Erro ao criar o container.');
        }
      });
    }
  });
});

// Encerra todos os containers criados por esse processo
process.on('SIGINT', async () => {
  console.log('Encerrando containers...');

  for (const containerName of Object.keys(containerRegistry)) {
    try {
      const container = docker.getContainer(containerName);
      await container.stop();
      await container.remove();
      console.log(`Container ${containerName} removido`);
    } catch (err) {
      console.error(`Erro ao remover container ${containerName}:`, err.message);
    }
  }

  process.exit();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor ouvindo em http://0.0.0.0:${PORT}`);
});
