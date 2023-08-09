# Variables
ARG BUILDER=node:18.17.0-alpine3.17
ARG IMAGE=${BUILDER}
ARG APP_USER=root
ARG APP_HOME=/hardhat


# Build
FROM ${BUILDER} AS builder

ARG APP_USER
ARG APP_HOME

# Install fail on arm64 without additional packages
RUN if [ $(uname -m) = "aarch64" ] ; then \
      if [ $(awk -F '=' '/^ID/ {print $2}' /etc/os-release) = "alpine" ] ; then \
        apk add --update --no-cache python3 python3 make g++ ; \
      else \
        apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/* ; \
      fi \
    fi

WORKDIR ${APP_HOME}
COPY --chown=${APP_USER}:${APP_USER} . .

RUN npm install


# Create
FROM ${IMAGE}

ARG APP_USER
ARG APP_HOME

WORKDIR ${APP_HOME}
COPY --chown=${APP_USER}:${APP_USER} --from=builder ${APP_HOME} .

EXPOSE 8545

CMD ["sh", "docker/deploy.sh"]
