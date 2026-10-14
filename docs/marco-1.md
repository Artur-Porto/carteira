# Marco 1: esqueleto do app

Construído em 13/10/2026. Aceite do SPEC: instala no iPhone, abre offline e o backup restaura idêntico. Aceito no iPhone em 14/10/2026, com todos os passos do roteiro abaixo.

## O que foi entregue

- **App instalável** em https://artur-porto.github.io/carteira/, no lugar da página de teste do marco 0. Vite, React e TypeScript em modo estrito.
- **Navegação** por abas: Início, Carteira, Aporte, Revisão e Mais. A aba Mais leva a Reserva, Previdência, Política, Cenários, Ferramentas, Conversa com o Claude e Ajustes. As telas dos próximos marcos dizem o que vai chegar e em qual marco.
- **Armazenamento** em IndexedDB, pelo Dexie, com as tabelas do modelo de dados do SPEC na versão 1 do esquema. O app pede armazenamento persistente.
- **Primeira abertura** com três saídas: explorar com dados fictícios, começar do zero ou restaurar um backup.
- **Dados fictícios** com todas as classes, reserva, previdência, um aporte, um registro no diário e uma tese. Nomes, valores e datas são inventados.
- **Backup cifrado** no formato `.carteira` versão 1, descrito em `src/data/crypto.ts`:
  - AES-256-GCM, com chave derivada da senha por PBKDF2-SHA-256 com 600 mil iterações e separada por HKDF.
  - Na restauração, o app diz por que recusou um arquivo: não é um backup, senha errada, arquivo alterado ou versão mais nova.
  - O backup sai pelo menu Compartilhar do iPhone, que avisa se o arquivo foi salvo. Só nesse caso o app grava a data do último backup. O download fica para navegadores sem compartilhamento de arquivos.
- **Modo discreto:** o olho no topo oculta todos os valores, e a escolha fica gravada.
- **Ajustes:** backup, restauração, modo discreto, dados fictícios, armazenamento e apagar tudo, este último com confirmação digitada.
- **CSP** na versão publicada: `default-src 'self'; connect-src 'self'`, sem script nem estilo embutido. O Zod roda sem `eval`.
- **Service worker** do Workbox: o app abre offline, e cada versão nova assume na abertura seguinte. Ele também substitui o service worker da página de teste e apaga o que ela deixou no aparelho.

## Testes

- **Unidade** (Vitest, `npm test`), 16 casos:
  - formato do backup, com senha errada, arquivo alterado, arquivo de outro tipo, versão mais nova e senha com acento;
  - backup que restaura idêntico;
  - faixas 5/25 e perdas dos cenários iguais às do SPEC;
  - formatos brasileiros de dinheiro e data.
- **Ponta a ponta** (Playwright, `npm run e2e`), no WebKit com tela de iPhone e no Chromium:
  - todas as telas e o modo discreto;
  - backup que restaura idêntico, comparando o IndexedDB inteiro antes e depois;
  - recusa de arquivo errado;
  - nenhuma requisição fora da própria origem numa sessão completa, com as violações da CSP também vigiadas;
  - CSP bloqueando outro site;
  - abertura offline, só no Chromium, onde o Playwright controla o service worker.
- **Publicação:** o workflow `deploy` roda todos os testes e só publica se passarem.
- **Troca da página de teste pelo app:** foi testada à parte no Chromium. Com a página de teste instalada, o app assumiu na abertura seguinte, em cerca de 3,5 segundos, e apagou o cache e o banco da página de teste.

## Fica para depois

- **Roteiro da primeira abertura** com custo mensal, saldos da reserva e dados da previdência: marco 2, junto das telas que usam esses dados.
- **Preços de mercado:** chegam no marco 2. Até lá, o Início mostra o valor aplicado.
- **Bloqueio por senha ao abrir:** o SPEC prevê o recurso opcional e desligado, mas não diz em que marco. Proposta: marco 6, com a auditoria de privacidade.

## Teste no iPhone

1. Apague o ícone "Teste Carteira" da Tela de Início. O nome e o ícone ficam presos ao que foi instalado, então o app precisa de um ícone novo.
2. No Safari, abra https://artur-porto.github.io/carteira/. Se ainda aparecer a página de teste, recarregue. Quando aparecer "Carteira" com os botões de começar, toque em Compartilhar → Adicionar à Tela de Início.
3. Abra pelo ícone novo e toque em **Explorar com dados fictícios**.
4. **Offline:** ative o modo avião, feche o app pelo seletor de apps e abra de novo pelo ícone. Ele deve abrir com os dados fictícios. Depois, desative o modo avião.
5. **Backup:** em Mais → Ajustes, crie uma senha de teste e toque em **Preparar backup** e depois em **Salvar backup**. No menu, toque em Salvar em Arquivos e escolha a pasta Downloads.
6. **Restauração:** ainda em Ajustes, digite APAGAR e toque em **Apagar tudo**. Na tela inicial, toque em **Restaurar um backup**, escolha o arquivo e digite a senha. Tudo deve voltar como estava, e Ajustes deve mostrar a data do backup.
7. Conte o resultado de cada passo e qualquer coisa estranha nas telas.

### Resultado (14/10/2026)

| Passo | Resultado |
| --- | --- |
| Instalação pelo ícone novo, no lugar da página de teste | OK |
| Abertura offline, em modo avião, depois de fechar o app | OK |
| Backup salvo pelo menu Compartilhar | OK |
| Apagar tudo e restaurar o backup | OK: tudo voltou como estava |

Marco 1 concluído em 14/10/2026.
