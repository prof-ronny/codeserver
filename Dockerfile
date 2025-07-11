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

# Instala Docker CLI (cliente) — não o daemon
RUN curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-26.1.1.tgz | tar xz \
  && mv docker/docker /usr/local/bin/ \
  && rm -rf docker

# Retorna para o usuário normal
USER coder

# Define variáveis para o NVM
ENV HOME=/home/coder
ENV NVM_DIR=$HOME/.nvm

# Instala o NVM como o usuário 'coder'
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Prepara o .bashrc para ativar o NVM e instalar automaticamente Node LTS e Yarn
RUN echo '\nexport NVM_DIR="$HOME/.nvm"' >> $HOME/.bashrc \
 && echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> $HOME/.bashrc \
 && echo 'nvm install --lts' >> $HOME/.bashrc \
 && echo 'nvm use --lts' >> $HOME/.bashrc \
 && echo 'npm install -g yarn' >> $HOME/.bashrc

# Define o diretório de trabalho
WORKDIR /home/coder/project

# Expõe a porta usada pelo code-server
EXPOSE 8080

# Usa o cache do NPM se estiver montado
RUN echo 'export npm_config_cache=/home/coder/npm-cache' >> $HOME/.bashrc


# Executa o code-server na pasta correta, sem autenticação
CMD ["code-server", "--auth=none", "--bind-addr", "0.0.0.0:8080", "/home/coder/project"]
