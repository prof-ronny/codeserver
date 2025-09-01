# Base Ubuntu (apt-get)
FROM codercom/code-server:4.103.2-focal

USER root
RUN apt-get update && apt-get install -y \
    curl git python3 python3-pip build-essential zip sudo locales \
 && sed -i 's/^# *\(pt_BR.UTF-8\)/\1/' /etc/locale.gen \
 && locale-gen pt_BR.UTF-8 && update-locale LANG=pt_BR.UTF-8 LC_ALL=pt_BR.UTF-8 \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Docker CLI (cliente)
RUN curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-26.1.1.tgz \
 | tar xz && mv docker/docker /usr/local/bin/ && rm -rf docker

USER coder
ENV HOME=/home/coder
ENV LANG=pt_BR.UTF-8 LC_ALL=pt_BR.UTF-8 LANGUAGE=pt_BR:pt:en
ENV NVM_DIR=$HOME/.nvm
ENV PATH="$NVM_DIR/versions/node/v20.14.0/bin:$PATH"
ENV npm_config_cache=/home/coder/npm-cache

# Node LTS + Yarn
RUN bash -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && \
  export NVM_DIR=$HOME/.nvm && source $NVM_DIR/nvm.sh && \
  nvm install --lts && nvm use --lts && npm install -g yarn"

# Python formatter
RUN pip3 install --no-cache-dir autopep8

# Extensões (Open VSX) — fixe a versão do language pack compatível com 1.103.x
RUN code-server --install-extension dbaeumer.vscode-eslint \
 && code-server --install-extension esbenp.prettier-vscode \
 && code-server --install-extension dsznajder.es7-react-js-snippets \
 && code-server --install-extension ms-python.python \
 && code-server --install-extension ms-pyright.pyright \
 && code-server --install-extension ms-python.autopep8 \
 && code-server --install-extension MS-CEINTL.vscode-language-pack-pt-BR@1.103.0

# Preferências + forçar locale em todos os lugares que a UI considera
RUN mkdir -p "$HOME/.local/share/code-server/User" "$HOME/.config/code-server" "$HOME/.vscode" && \
    printf '{\n  "locale": "pt-br"\n}\n' > "$HOME/.local/share/code-server/User/locale.json" && \
    printf '{\n  "locale": "pt-br"\n}\n' > "$HOME/.vscode/argv.json" && \
    printf 'bind-addr: 0.0.0.0:8080\nauth: none\nlocale: pt-br\n' > "$HOME/.config/code-server/config.yaml" && \
    printf '{\n  "editor.formatOnSave": true,\n  "editor.tabSize": 2,\n  "files.eol": "\\n",\n  "javascript.updateImportsOnFileMove.enabled": "always",\n  "editor.defaultFormatter": "esbenp.prettier-vscode",\n  "[python]": { "editor.defaultFormatter": "ms-python.autopep8" },\n  "python.defaultInterpreterPath": "/usr/bin/python3",\n  "python.analysis.typeCheckingMode": "basic"\n}\n' > "$HOME/.local/share/code-server/User/settings.json"

# Reforço NLS: informa à UI que *todas* as strings têm pt-br disponível
ENV VSCODE_NLS_CONFIG='{"locale":"pt-br","availableLanguages":{"*":"pt-br"}}'

WORKDIR /home/coder/project
EXPOSE 8080

CMD ["code-server", "--locale", "pt-br", "--auth=none", "--bind-addr", "0.0.0.0:8080", "/home/coder/project"]
