FROM codercom/code-server:4.101.2

USER root

# Instala ferramentas essenciais
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    python3-pip \
    build-essential \
    zip \
    sudo \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Instala Docker CLI (cliente)
RUN curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-26.1.1.tgz | tar xz \
  && mv docker/docker /usr/local/bin/ \
  && rm -rf docker

# Volta para o usuário padrão
USER coder

# Variáveis para o NVM
ENV HOME=/home/coder
ENV NVM_DIR=$HOME/.nvm
ENV PATH="$NVM_DIR/versions/node/v20.14.0/bin:$PATH"
ENV npm_config_cache=/home/coder/npm-cache

# Instala NVM + Node LTS + Yarn (executando de verdade agora)
RUN bash -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
  export NVM_DIR=$HOME/.nvm && \
  source $NVM_DIR/nvm.sh && \
  nvm install --lts && \
  nvm use --lts && \
  npm install -g yarn"

# Cria pasta de cache NPM se desejado
RUN mkdir -p /home/coder/npm-cache

# Define o diretório de trabalho
WORKDIR /home/coder/project

# Porta padrão do code-server
EXPOSE 8080

# Inicia o code-server sem autenticação
CMD ["code-server", "--auth=none", "--bind-addr", "0.0.0.0:8080", "/home/coder/project"]
