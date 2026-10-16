# Sobre o projeto

O **Conecta** é uma plataforma web de salas de conversa em tempo real. Cada sala junta chat de
texto, chamada de voz e chamada de vídeo em grupo, sem trocar de página ou de aplicativo. A pessoa
cria uma conta, confirma o e-mail, entra numa sala (ou cria a sua) e conversa por texto ou liga a
câmera e o microfone.

## Funcionalidades

- **Chat em tempo real** com histórico paginado, mensagens agrupadas por autor e indicador de "digitando…"
- **Voz e vídeo em grupo** (até 6 pessoas por chamada) com compartilhamento de tela
- **Legendas ao vivo:** a fala é transcrita em português e aparece para todos da chamada
- **Indicador de quem está falando:** um anel neon acende em quem fala
- **Reações flutuantes:** emojis que sobem pela tela de todos
- **Presença:** quem está online e quem está na chamada
- **Contas:** cadastro com e-mail e senha, confirmação de e-mail e recuperação de senha
- **Visual "Grafite Pro":** fundo grafite quase preto com cores vivas usadas com função (âmbar para quem fala, jade para ligado, azul-gelo para câmera e tela, lilás para legendas, coral para alertas)
- **Atalhos de teclado na chamada:** M microfone, V câmera, S tela, C legendas, R reações

## Tecnologias

| Camada | Tecnologia | Papel no projeto |
| --- | --- | --- |
| Backend | **Python + Django 5.2** | Regras de negócio, modelos e painel administrativo |
| API | **Django REST Framework** | Endpoints de contas, salas e mensagens |
| Autenticação | **JWT (SimpleJWT)** | Login sem sessão, com token de acesso e de renovação |
| Tempo real | **Django Channels + Daphne (ASGI)** | WebSocket para chat, presença e sinalização das chamadas |
| Frontend | **Angular 20 + TypeScript estrito** | Interface com signals, sem zone.js, componentes standalone |
| Voz e vídeo | **WebRTC** | Áudio e vídeo direto entre os navegadores |
| Áudio e fala | **Web Audio API e Web Speech API** | Detecção de quem fala e legendas ao vivo |
| Banco de dados | **PostgreSQL 17** | Usuários, salas e mensagens |
| Cache e mensageria | **Redis 7** | Distribui eventos entre servidores e guarda a presença |
| Infraestrutura | **Docker Compose, Nginx, coturn (TURN)** | Sobe tudo com um comando; TURN para redes restritas |
| E-mail | **SMTP + Mailpit** | Envio de e-mails; caixa de entrada de teste em desenvolvimento |
| Qualidade | **Pytest, Ruff, GitHub Actions** | Testes, lint e pipeline automático |

O navegador fala com o Django por REST (dados) e por WebSocket (eventos ao vivo). O servidor só
repassa a sinalização das chamadas; o áudio e o vídeo trafegam direto entre os participantes, o
que reduz custo e latência.

## Desafios e soluções

### 1. Conectar navegadores diretamente (WebRTC)
Para dois navegadores abrirem uma chamada, eles trocam ofertas, respostas e "candidatos" de rede.
Se os dois iniciam a negociação ao mesmo tempo, a conexão quebra (o chamado *glare*).
**Solução:** padrão *perfect negotiation*, em que um dos lados é "educado" e cede quando há colisão.

### 2. Redes que bloqueiam conexão direta
Em redes corporativas ou móveis com NAT restritivo, a conexão ponto a ponto falha.
**Solução:** STUN para descobrir o endereço público e um servidor **TURN (coturn)** que retransmite
a mídia quando a conexão direta não é possível.

### 3. Limite da topologia em malha
Na malha, cada pessoa envia seu vídeo para todas as outras, e o consumo de banda cresce rápido.
**Solução:** limite de 6 participantes por chamada. Para salas grandes, o próximo passo é um
**SFU** (como LiveKit ou mediasoup).

### 4. Estado compartilhado entre vários servidores
Com mais de um processo rodando, cada um só conhece as próprias conexões.
**Solução:** o **Redis** distribui os eventos entre processos e guarda quem está online em cada sala.

### 5. Autenticação no WebSocket
O navegador não permite enviar cabeçalhos customizados ao abrir um WebSocket.
**Solução:** o token JWT vai na URL e é validado por um middleware próprio. Quando o token expira,
o frontend renova sozinho e reconecta, com espera progressiva entre as tentativas.

### 6. Reconexão sem perder consistência
Se a internet cai, a pessoa volta com uma nova identidade de conexão: a chamada antiga precisa ser
encerrada e recriada, e as mensagens não podem aparecer duplicadas.
**Solução:** cada mensagem tem um identificador único e o estado da sala é reconstruído ao reconectar.

### 7. Restrições do navegador para câmera e microfone
Essas APIs só funcionam em HTTPS ou localhost, e cada navegador lida com permissões de um jeito.
**Solução:** o sistema tenta áudio e vídeo juntos, depois só áudio, depois só vídeo, e avisa
claramente quando nada funciona.

### 8. Legendas ao vivo
A Web Speech API não é padronizada: funciona bem no Chrome e no Edge, mas não em todos os
navegadores, não vem tipada no TypeScript e para sozinha depois de um tempo.
**Solução:** tipagem própria, reinício automático do reconhecimento e botão escondido onde não há suporte.

### 9. Manter backend e frontend em sincronia
São mais de 20 tipos de evento no WebSocket.
**Solução:** cada evento virou um tipo no TypeScript (união discriminada), então o compilador acusa
erro se um evento for tratado com o formato errado.

### 10. Segurança nas contas
**Solução:**
- a recuperação de senha não revela se um e-mail está cadastrado;
- links de redefinição são de uso único e têm prazo;
- o envio de e-mails tem limite, para evitar spam;
- um servidor de e-mail fora do ar não derruba o cadastro.

## Próximos passos

- SFU para chamadas com dezenas de participantes
- Envio de arquivos e imagens no chat
- Salas privadas com convite
- Gravação de chamadas
