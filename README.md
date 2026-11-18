# Desafio Cowork

Provinha gamificada com 10 perguntas (fácil, médio, difícil e desafio), pontuação por acerto e por rapidez, e uma área de admin para ver quem pontuou mais.

- Cada pessoa joga uma vez, só informando o nome.
- O gabarito fica no servidor. O navegador do participante nunca recebe a resposta certa antes de enviar.
- O admin mostra o ranking, destaca os 2 primeiros, trata empate e faz o sorteio quando precisar.

## Como colocar no ar

### 1. Subir no GitHub
1. Crie um repositório novo (pode ser privado).
2. Envie todos os arquivos desta pasta para a raiz do repositório.

### 2. Importar na Vercel
1. Em vercel.com, clique em Add New, Project e escolha o repositório.
2. Não precisa mudar nenhuma configuração de build. Clique em Deploy.

### 3. Criar o banco de dados (obrigatório)
O ranking precisa de um lugar para guardar os resultados.
1. No projeto da Vercel, abra a aba Storage.
2. Escolha Upstash Redis (pelo Marketplace) e crie um banco gratuito.
3. Conecte o banco ao projeto. A Vercel cria sozinha as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.

### 4. Definir a senha do admin
1. Em Settings, Environment Variables, crie `ADMIN_PASSWORD` com a senha que só você vai usar.
2. Faça um novo deploy (aba Deployments, menu dos três pontos, Redeploy) para as variáveis valerem.

### 5. Usar
- Participantes: `https://seu-projeto.vercel.app`
- Admin: `https://seu-projeto.vercel.app/admin`

## Regras de pontuação

| Nível | Pontos base |
|---|---|
| Fácil (3 perguntas) | 100 |
| Médio (3 perguntas) | 150 |
| Difícil (3 perguntas) | 200 |
| Desafio (1 pergunta) | 300 |

- Bônus de velocidade: até 50% da base, conforme o tempo (20 segundos por pergunta).
- Bônus de sequência: 25 pontos por acerto seguido (0, 25, 50, 75, 100 no máximo).
- Resposta em branco ou fora do tempo vale zero e quebra a sequência.

## Quem ganha o brinde
Os 2 primeiros por pontos. Em caso de empate, vale quem acertou mais nas difíceis e no desafio. Persistindo o empate, o admin tem o botão Sortear.

## Painel de admin
- Classificação atualizada a cada 10 segundos.
- Provinha aberta: desliga para impedir novas entradas.
- Mostrar gabarito ao terminar: desligado por padrão, para ninguém passar as respostas para os colegas. Ligue depois que todos terminarem.
- Liberar nome: se alguém caiu no meio, libere o nome para a pessoa jogar de novo.
- Baixar CSV: exporta o ranking.
- Zerar tudo: apaga todos os participantes (use antes de uma nova turma).

## Sobre o "só uma vez"
O controle é feito pelo nome, no servidor. Nomes iguais, mesmo com acento ou maiúscula diferente, contam como a mesma pessoa. Como só se pede o nome, quem quiser burlar pode inventar outro nome. Para evitar isso, peça que usem nome e sobrenome e fique de olho na lista do admin.

## Estrutura
- `index.html`, `app.js`, `style.css`: tela do participante.
- `admin.html`, `admin.js`, `admin.css`: painel do apresentador.
- `api/start.js`, `api/submit.js`, `api/admin.js`: rotas do servidor (funções da Vercel).
- `api/_lib.js`: banco (Upstash Redis via REST), pontuação e utilidades.
- `api/_questions.js`: perguntas e gabarito.

**Importante:** a pasta `api/` precisa estar no repositório. Sem ela, a Vercel responde "The page could not be found" e a provinha não funciona.

## Mudar as perguntas
Edite `api/_questions.js`. O campo `correct` é a posição da alternativa certa (0 é a letra A).

## Testar no computador (opcional)
```
npm i -g vercel
vercel dev
```
Crie um arquivo `.env.local` com `KV_REST_API_URL`, `KV_REST_API_TOKEN` e `ADMIN_PASSWORD`.
