# Marco 0: fontes de dados, iPhone e parâmetros fiscais

Validação feita em 12/10/2026. Este arquivo registra o que funcionou, o que falhou e as escolhas feitas para os marcos seguintes. Não contém dado pessoal.

## Resumo

| Item | Resultado | Escolha |
| --- | --- | --- |
| Índices do Banco Central (SGS) | Funciona local e no runner | Fonte principal |
| Tesouro Transparente (CSV) | Funciona local e no runner | Fonte principal, também para o termômetro |
| B3 COTAHIST diário | Funciona local e no runner | Fonte principal; alternativas não são necessárias por ora |
| Feriados ANBIMA (.xls) | Funciona local e no runner | Fonte principal |
| Cripto: Mercado Bitcoin | Funciona local e no runner | Fonte principal |
| Cripto: Coinbase | Funciona local e no runner | Reserva |
| Cripto: Binance | Bloqueada no runner (HTTP 451) | Descartada |
| iPhone: instalação, offline, armazenamento, cifra, CSP | OK no aparelho | Ver seção iPhone |
| iPhone: exportar e importar arquivo | **Aguarda teste no aparelho** | Ver seção iPhone |
| Parâmetros fiscais "A confirmar" | Todos confirmados em fonte oficial | Ver seção fiscal |

## Como reproduzir

- `pipeline/probe.ts` testa todas as fontes. Rodar com `cd pipeline && npm ci && node probe.ts` (Node 22.18 ou mais recente). O relatório sai em `pipeline/out/`.
- O workflow `probe-sources` roda o mesmo script num runner do GitHub, a cada push em `pipeline/` ou manualmente.
- Execução de referência no runner: [run 38328417164](https://github.com/Artur-Porto/carteira/actions/runs/38328417164), Ubuntu 24.04, em 13/10/2026 00:40 UTC.

## Fontes de dados

### Banco Central, SGS

- **Endpoint:** `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{código}/dados?formato=json&dataInicial=dd/mm/aaaa&dataFinal=dd/mm/aaaa`, ou `/dados/ultimos/{N}?formato=json`. Público, sem chave.
- **Séries escolhidas:**

  | Dado | Código | Unidade | Observação |
  | --- | --- | --- | --- |
  | CDI diário | 12 | % ao dia | Base do rendimento da reserva |
  | Selic diária | 11 | % ao dia | Para o Tesouro Selic e o Tesouro Reserva |
  | Selic meta | 432 | % ao ano | Vem com datas futuras até a próxima reunião do Copom |
  | IPCA mensal | 433 | % no mês | Data no dia 1º do mês de referência |
  | Dólar PTAX venda | 1 | R$ por US$ | |

- **Formato:** `[{"data":"dd/mm/aaaa","valor":"0.050788"}]`. O valor vem como texto, com ponto decimal, o que é bom para a biblioteca decimal.
- **Regras que a rotina precisa seguir:**
  - Séries diárias aceitam janela de no máximo 10 anos. Pedido maior volta HTTP 406. O histórico longo tem de ser baixado em fatias.
  - A ordem não é garantida (a série 1178 veio decrescente). Ordenar sempre por data.
  - Descartar datas futuras (série 432).
  - Houve uma resposta de 11,9 s no runner. Usar tempo limite de 60 s e duas novas tentativas.

### Tesouro Transparente

- **Endpoint estável:** `https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto`. Ele devolve a URL atual do CSV, então a rotina não depende de um link fixo.
- **CSV:** cerca de 14 MB e 177 mil linhas, com histórico desde 31/12/2004. Baixou em 10 a 24 s. Atualizado todo dia útil, com o fechamento do dia anterior.
- **Colunas:** `Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha`. Separador `;`, decimal com vírgula, datas `dd/mm/aaaa`, codificação latin1, linhas fora de ordem. A rotina confere o cabeçalho e falha de forma controlada se ele mudar.
- **Tipos presentes:** Educa+, IGPM+ com Juros Semestrais, IPCA+, IPCA+ com Juros Semestrais, Prefixado, Prefixado com Juros Semestrais, Renda+ Aposentadoria Extra e Selic.
- **Tesouro Reserva não aparece no CSV.** Como rende a Selic sem marcação a mercado, o app estima o saldo pela série 11 do SGS.
- **Termômetro, calculado no teste:** para cada data, a rotina toma o título sem cupom cujo vencimento fica mais perto do prazo-alvo e calcula o percentil da taxa de hoje nos últimos 10 anos.

  | Série | Título usado hoje | Taxa em 09/10/2026 | Percentil em 10 anos | Observações |
  | --- | --- | --- | --- | --- |
  | IPCA+ perto de 10 anos | Tesouro IPCA+ 2035 | 6,66% | 80,8 | 2.489 |
  | Prefixado perto de 3 anos | Tesouro Prefixado 2029 | 12,30% | 73,2 | 2.489 |

  Pela regra do SPEC (percentil 75 ou mais), hoje o termômetro deslocaria o alvo de IPCA+ longo para cima e deixaria o prefixado no alvo. O título usado muda quando outro vencimento passa a ficar mais perto do prazo-alvo; isso causa pequenos saltos na série, aceitáveis para um percentil de 10 anos.

### B3, COTAHIST diário

- **Endpoint:** `https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_D{ddmmaaaa}.ZIP`. Funcionou do runner sem cabeçalho especial.
- **Tamanho:** cerca de 550 KB compactado e 4,7 MB descompactado. Disponível na noite do próprio pregão.
- **Dia sem pregão:** HTTP 404. A rotina recua até achar o último pregão.
- **Layout:** largura fixa de 245 colunas, latin1. Preços com duas casas decimais implícitas. Campos usados: `CODBDI` (col. 11–12), `CODNEG` (13–24), `TPMERC` (25–27), `ESPECI` (40–49), `PREULT` (109–121).
- **Filtro:** mercado à vista (`TPMERC = 010`) e `CODBDI` 02 (ações, lote padrão), 12 (FIIs), 14 (ETFs, inclusive os de cripto, como BITH11) e 34 a 36 (BDRs). Em 09/10/2026 isso dá cerca de 1.430 papéis, publicados todos, conforme a regra de privacidade 5.
- **Histórico:** se for preciso, os arquivos anuais `COTAHIST_A{aaaa}.ZIP` ficam no mesmo endereço.
- **Alternativas do SPEC:** não foram necessárias. Ficam na ordem prevista, caso a B3 passe a bloquear o runner.

### ANBIMA, feriados nacionais

- **Endpoint:** `https://www.anbima.com.br/feriados/arqs/feriados_nacionais.xls`, com cerca de 110 KB.
- **Conteúdo:** colunas `Data | Dia da Semana | Feriado`, com 1.264 feriados de 2001 a 2099, inclusive o Dia da Consciência Negra (20/11). O rodapé tem texto e é ignorado.
- **Leitura:** SheetJS, que já está na pilha do app. O pacote é instalado do CDN oficial da SheetJS (`cdn.sheetjs.com`), porque a versão no npm está desatualizada. Isso vale só para a rotina e para a construção; o app não carrega nada de CDN.
- Como a lista vai até 2099, basta baixar uma vez por mês.

### Cripto em reais

| Fonte | Endpoint | Local | Runner | Escolha |
| --- | --- | --- | --- | --- |
| Mercado Bitcoin | `api.mercadobitcoin.net/api/v4/tickers?symbols=BTC-BRL,ETH-BRL` | OK | OK | Principal |
| Coinbase | `api.coinbase.com/v2/prices/BTC-BRL/spot` | OK | OK | Reserva |
| Binance | `api.binance.com/api/v3/ticker/price` | OK | HTTP 451 | Descartada: bloqueia os servidores do GitHub, que ficam nos EUA |

Cripto continua opcional: se as duas fontes falharem, o arquivo anterior é mantido e `meta.json` marca o atraso.

## iPhone

A página de teste está em **https://artur-porto.github.io/carteira/**. É um PWA mínimo, só com dados fictícios, com a mesma CSP prevista para o app (`default-src 'self'; connect-src 'self'`).

### O que a página testa

| Teste | Como | Resultado no Chrome headless (Windows) | Resultado no iPhone |
| --- | --- | --- | --- |
| Instalação pela tela de início | `display-mode: standalone` | Não se aplica | OK |
| Abertura offline | Cada abertura grava linha no IndexedDB com o estado da rede | OK (recarregou offline pelo service worker) | OK: reabriu pelo ícone, offline, com o service worker ativo |
| Armazenamento persistente | `navigator.storage.persist()` | `false` (esperado no Chrome headless) | OK: concedido; cota de cerca de 38 GB |
| IndexedDB | Grava e lê uma carteira fictícia | OK | OK, inclusive entre o fechamento e a reabertura do app |
| Cifra do backup | AES-GCM 256, PBKDF2-SHA-256 com 600 mil iterações; senha errada e arquivo corrompido | OK, 268 ms para derivar a chave | OK, 111 ms para derivar a chave; senha errada e arquivo corrompido recusados |
| CSP | Tenta ler o SGS direto do app; deve ser bloqueado | OK, bloqueado por `connect-src` antes de sair da máquina | OK, bloqueado por `connect-src` |
| Exportar pelo Compartilhar | `navigator.share({files})` com `.carteira` | `canShare` = sim | `canShare` = sim; falta salvar de fato |
| Exportar por download | `<a download>` | Não testado | _pendente_ |
| Importar backup | Seletor de arquivo, decifra e compara com o original | Não testado | _pendente_ |
| Importar planilha | Seletor com `.csv` e `.xlsx`; informa só formato e tamanho | Não testado | _pendente_ |

### Primeira rodada no iPhone (12/10/2026)

Aparelho: iPhone com iOS 26. Nesta versão o user agent congela o campo do sistema ("iPhone OS 18_7"); a versão real do Safari vem do campo `Version/`.

O primeiro relatório trouxe só as aberturas, porque a página v1 guardava os resultados na memória e os perdia ao fechar o app. Num segundo relatório, ainda da v1, todos os testes automáticos passaram. A página v2 grava os resultados no IndexedDB e roda os testes a cada abertura.

Faltam os quatro testes de arquivo: exportar pelo Compartilhar, exportar por download, importar o backup e importar uma planilha.

### Roteiro no aparelho

1. Abra o endereço no Safari e toque em Compartilhar → Adicionar à Tela de Início.
2. Abra pelo ícone e toque em **Rodar testes**.
3. Toque em **Exportar pelo menu Compartilhar** e salve em Arquivos. Repita com **Exportar por download**.
4. Em **Importar arquivo .carteira**, escolha o arquivo salvo. Em **Importar planilha**, escolha qualquer `.csv` ou `.xlsx` (só o formato e o tamanho aparecem; nome e conteúdo nunca entram no relatório).
5. Ative o modo avião, feche o app pelo seletor de apps e abra de novo pelo ícone.
6. Toque em **Rodar testes** outra vez e depois em **Copiar resultado**. Cole o texto na conversa com o Claude Code.

O relatório copiado traz o modelo do aparelho e a versão do iOS (pelo user agent) e os resultados. Não traz nada da sua carteira.

### Pontos de atenção para o marco 1

- O arquivo do backup é preparado antes do toque, porque o Safari exige que `navigator.share` seja chamado logo após o gesto do usuário. A derivação de 600 mil iterações, feita entre o toque e o compartilhamento, pode estourar essa janela.
- O formato `CART0` da página de teste é provisório. O formato definitivo do `.carteira` sai no marco 1.
- A política do WebKit isenta da limpeza de 7 dias os apps abertos pela tela de início. A lista de aberturas permite conferir isso daqui a algumas semanas.

## Parâmetros fiscais "A confirmar"

Conferidos em 12/10/2026, no texto da lei no Planalto e no [Perguntas e Respostas IRPF 2026](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf) da Receita Federal (versão 1.00, de 23/04/2026).

| Regra | Valor confirmado | Fonte oficial | Diferença para o SPEC |
| --- | --- | --- | --- |
| ETFs de renda fixa | 25% se o prazo médio de repactuação da carteira for de até 180 dias; 20% de 181 a 720; 15% acima de 720. Se o fundo não mantiver 75% em ativos do índice, 30%. Retido na fonte, sem come-cotas | [Lei 13.043/2014, art. 2º](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l13043.htm) | Acrescentar o caso de 30%. O prazo é o da carteira do fundo, não o tempo do investidor |
| Cripto em corretora no Brasil | Isento se o total vendido no mês, somando todos os criptoativos, for de até R$ 35 mil. Acima disso, todo o ganho do mês é tributado: 15% até R$ 5 milhões, 17,5% até R$ 10 milhões, 20% até R$ 30 milhões e 22,5% acima. DARF código 4600 até o último dia útil do mês seguinte | [Lei 9.250/1995, art. 22, II](https://www.planalto.gov.br/ccivil_03/leis/l9250.htm); [Lei 8.981/1995, art. 21](https://www.planalto.gov.br/ccivil_03/leis/l8981.htm); Perguntas e Respostas IRPF 2026, pergunta 653 | Confirma o SPEC. A MP 1.303/2025, que acabaria com a isenção, perdeu a vigência sem ser votada; por isso as fontes de 2026 divergiam |
| Cripto em corretora no exterior | Sem isenção; tributado na declaração anual, conforme a Lei 14.754/2023 | Perguntas e Respostas IRPF 2026, pergunta 653 | Fora do escopo do app; registrar como aviso |
| ETFs de cripto na B3 | Mesma regra dos ETFs de renda variável: 15% sobre o ganho (20% em day trade), sem a isenção de R$ 20 mil, que a lei restringe a ações e ouro | [Lei 11.033/2004, art. 3º, I](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm); [B3 Bora Investir](https://borainvestir.b3.com.br/tipos-de-investimentos/renda-variavel/criptoativos/como-declarar-etfs-de-cripto-e-futuro-de-bitcoin/) | Confirma o SPEC |
| PGBL: escolha do regime | Pode ser feita até a obtenção do benefício ou o pedido do primeiro resgate, e é irretratável. Quem já tinha optado pode optar de novo até esse momento | [Lei 14.803/2024](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14803.htm), que alterou o art. 1º, § 6º, da Lei 11.053/2004 | Confirma o SPEC; acrescentar "irretratável" |
| PGBL: exigência de contribuir ao INSS | Obrigatória: a dedução exige contribuição também ao regime geral (INSS) ou a regime próprio. A exceção são os aposentados e pensionistas desses regimes | [Lei 9.532/1997, art. 11, caput e § 5º](https://www.planalto.gov.br/ccivil_03/leis/l9532.htm); Perguntas e Respostas IRPF 2026 | Trocar "fica a confirmar" por regra confirmada |
| PGBL: contribuição da empresa fora dos 12% | Confirmado: o limite de 12% vale só para as contribuições "cujo ônus seja da própria pessoa física". A parte da empresa não é deduzida pelo participante nem consome o limite | [Lei 9.532/1997, art. 11](https://www.planalto.gov.br/ccivil_03/leis/l9532.htm); Perguntas e Respostas IRPF 2026, perguntas 335 e 339 | Trocar "(a confirmar)" por regra confirmada |

### Sugestões de ajuste no SPEC.md

Não alterei o SPEC. Se você aprovar, aplico estes ajustes:

1. Na tabela de parâmetros fiscais, marcar as quatro linhas "A confirmar" como "Conferido em 10/2026", com as fontes acima, e acrescentar o caso de 30% dos ETFs de renda fixa.
2. Em "Previdência", trocar "A exigência de contribuir ao INSS fica a confirmar" e "(a confirmar)" pelas regras confirmadas.
3. Em "Dados de mercado", registrar que o Tesouro Reserva é estimado pela Selic diária (SGS 11) e que cripto usa Mercado Bitcoin com Coinbase de reserva.
4. Em "Em aberto", marcar como feito o item "Reconferir os itens 'A confirmar' dos parâmetros fiscais".

## Pendências para fechar o marco 0

- [x] Testes automáticos no iPhone: instalação, offline, armazenamento persistente, IndexedDB, cifra e CSP.
- [ ] Testes de arquivo no iPhone: exportar pelo Compartilhar, exportar por download, importar backup e importar planilha.
- [ ] Decidir sobre os ajustes no SPEC.md.
