# Conecta

**Salas de conversa com chat de texto, voz e vídeo em tempo real** — com legendas ao vivo,
indicador de quem está falando, reações que voam pela tela e compartilhamento de tela.

![Django](https://img.shields.io/badge/Django-5.2-0C4B33?logo=django&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-20-DD0031?logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-mesh-333333?logo=webrtc&logoColor=white)

## ✨ Destaques

| Recurso | Como funciona |
| --- | --- |
| 💬 **Chat em tempo real** | WebSocket (Django Channels), histórico paginado por cursor, agrupamento de mensagens e indicador de digitação |
| 🎙️ **Voz e 📹 vídeo em grupo** | WebRTC ponto a ponto em malha (até 6 pessoas por padrão), com o padrão *perfect negotiation* para evitar colisões de oferta |
| 📝 **Legendas ao vivo** | A fala é transcrita no próprio navegador (Web Speech API, pt-BR) e o texto é compartilhado com todos da chamada |
| 🟢 **Quem está falando** | Análise de volume via Web Audio API acende um anel neon no participante ativo |
| 🚀 **Reações flutuantes** | Emojis enviados por qualquer participante sobem pela tela de todos |
| 🖥️ **Compartilhar tela** | Troca a trilha de vídeo sem renegociar a conexão (`RTCRtpSender.replaceTrack`) |
| 🔁 **Resiliência** | Reconexão automática com *backoff* exponencial, renovação transparente do JWT e presença multi-aba |
| 🎨 **Visual "neon brutal"** | Cores vivas, contornos marcados e botões com onda de toque e explosão de confete no clique |

## 🏗️ Arquitetura

```mermaid
flowchart LR
    subgraph Navegador
        A[Angular 20<br/>signals + zoneless]
    end
    A -- REST /api --> N[Nginx]
    A -- WebSocket /ws --> N
    N --> D[Django + Channels<br/>Daphne ASGI]
    D --> P[(PostgreSQL)]
    D <--> R[(Redis<br/>channel layer + presença)]
    A <-. áudio/vídeo P2P .-> B[Outros navegadores]
    A <-. relay opcional .-> T[TURN coturn]
```

- **HTTP (DRF):** autenticação JWT, salas, histórico de mensagens e configuração ICE.
- **WebSocket (Channels):** mensagens, presença, digitação e **sinalização WebRTC**. O servidor só
  encaminha `offer`/`answer`/`ice`; a mídia trafega direto entre os navegadores.
- **Redis:** distribui eventos entre processos e guarda a presença de cada sala, permitindo escalar
  horizontalmente.

## 🚀 Como rodar

### Com Docker (recomendado)

```bash
cp .env.example .env
docker compose up --build
```

Acesse **http://localhost:8080**, crie uma conta e abra a mesma sala em duas abas (ou em outro
dispositivo) para testar a chamada.

> Câmera e microfone só funcionam em `localhost` ou HTTPS — exigência dos navegadores.
> Para usuários em redes diferentes, ative o TURN: `docker compose --profile turn up` e preencha
> `TURN_URLS` no `.env` (ex.: `turn:SEU_IP:3478`).

### Sem Docker

**Backend** (Python 3.12+):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver   # Daphne atende HTTP + WebSocket
```

Sem `DATABASE_URL` e `REDIS_URL` o projeto usa SQLite e um channel layer em memória — ótimo para
desenvolvimento rápido.

**Frontend** (Node 20+):

```bash
cd frontend
npm install
npm start                    # http://localhost:4200 com proxy para /api e /ws
```

## 🧪 Testes e qualidade

```bash
cd backend && pytest -q && ruff check .
cd frontend && npm run build   # strictTemplates + TypeScript estrito
```

O pipeline do GitHub Actions roda lint, verificação de migrations, testes do backend contra
PostgreSQL real e o build de produção do frontend.

## 📡 Protocolo do WebSocket

Conexão: `ws(s)://<host>/ws/rooms/<slug>/?token=<access_jwt>`

| Direção | Evento | Payload |
| --- | --- | --- |
| → | `chat.message` | `{content, clientId}` |
| → | `chat.typing` | `{isTyping}` |
| → | `call.join` / `call.leave` | `{media: {audio, video}}` / `{}` |
| → | `call.media` | `{media}` |
| → | `call.reaction` | `{emoji}` |
| → | `call.caption` | `{text, final}` |
| → | `rtc.offer` / `rtc.answer` / `rtc.ice` | `{to, sdp}` / `{to, candidate}` |
| ← | `session.ready` | `{peerId, peers}` |
| ← | `presence.joined` / `presence.left` | `{peer}` / `{peerId}` |
| ← | `call.accepted` | `{participants}` |
| ← | `call.joined` / `call.left` / `call.media` | — |
| ← | `rtc.*` | `{from, ...}` |
| ← | `error` | `{code, detail}` |

Os tipos ficam em `frontend/src/app/core/models.ts` como **uniões discriminadas**, então o
compilador garante que cada evento é tratado com o formato certo.

## 🗂️ Estrutura

```
backend/
  config/            settings, ASGI (HTTP + WebSocket), URLs
  apps/accounts/     usuário customizado (login por e-mail), registro, /me
  apps/chat/         salas, mensagens, consumer WebSocket, presença, middleware JWT
frontend/
  src/app/core/      modelos, auth (JWT + interceptor), API, socket, WebRTC
  src/app/shared/    botão personalizado, ícones, avatar, toasts
  src/app/features/  entrar, salas, sala (palco da chamada + chat)
```

## 🛣️ Próximos passos

- SFU (ex.: LiveKit/mediasoup) para chamadas com dezenas de participantes
- Envio de arquivos e imagens no chat
- Salas privadas com convite
- Gravação de chamadas

## 📄 Licença

[MIT](LICENSE)
