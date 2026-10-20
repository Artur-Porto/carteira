# Especificação do app de carteira

Oct 11, 2026

> **Aditivo 1, de 15/10/2026:** o arquivo [SPEC-ADITIVO-01-mesa-do-investidor.md](SPEC-ADITIVO-01-mesa-do-investidor.md) acrescenta a Mesa do investidor, nos marcos 7 a 9, e muda alguns padrões deste documento. Quando os dois divergirem, vale o aditivo. Ele será incorporado a este documento ao fim do marco 7.

App pessoal para iPhone que registra a carteira, compara com uma política de investimento e diz para onde vai cada aporte. Roda inteiro no aparelho, custa R$ 0 e não envia nenhum dado pessoal. Este documento é o que o Claude Code precisa para construir, e não contém dado pessoal: pode ir para um repositório público.

## Decisões fechadas

Estas escolhas já foram tomadas e valem para toda a construção.

| Tema | Decisão |
| --- | --- |
| Aparelho | iPhone. Web app instalável pela tela de início (PWA), usado offline. |
| Custo | R$ 0 para instalar e usar. Sem loja de apps, sem servidor e sem API paga. |
| Dados pessoais | Ficam só no aparelho. Nada sai dele, exceto o backup que o usuário exporta. |
| Hospedagem | Página estática no GitHub Pages, em repositório público sem dado pessoal. |
| Preços e taxas | Fechamento do dia, de fontes públicas, baixado por rotina agendada do GitHub. |
| Sugestões | Motor de regras determinístico dentro do app, sem IA embutida. O julgamento de analista vem da conversa com o Claude, por um resumo que o usuário cola. |
| Classes de ativo | Renda fixa bancária com FGC, Tesouro Direto, previdência, FIIs, ETFs, ações e cripto com teto. |
| Estilo de gestão | Revisão mensal e alertas por evento. O app não incentiva giro. |
| Papel do app | Sugere classe, tipo de ativo e valor. A escolha do ativo e a ordem na corretora são do usuário. |
| Idioma | Interface em português do Brasil. Código e nomes de arquivo em inglês. |

## Como as peças se encaixam

&#91;embedded content: arquitetura · 4 camadas e 2 saídas manuais\]

Só dados públicos de mercado circulam pela internet, sempre no sentido do iPhone. Do aparelho só saem o backup cifrado e o resumo em percentuais, e apenas quando o usuário pede.

## Regras de privacidade

Nenhum dado pessoal sai do aparelho, e o código tem de provar isso com testes.

1. **Sem rede de terceiros.** O app só faz requisições à própria origem, para ler `/data/*.json`. A Content-Security-Policy vai em meta tag, porque o GitHub Pages não aceita cabeçalhos próprios, e usa `default-src 'self'` e `connect-src 'self'`.
2. **Sem rastreio.** Nada de analytics, telemetria, relatório remoto de erros, fontes ou scripts de CDN. Toda dependência vai empacotada.
3. **Armazenamento local.** Carteira, política e diário ficam em IndexedDB. O app pede armazenamento persistente (`navigator.storage.persist()`) na primeira abertura.
4. **Repositório limpo.** O repositório público nunca recebe dado real, extrato, backup ou lista dos ativos do usuário. Desenvolvimento e testes usam dados fictícios.
5. **Mercado inteiro, não a carteira.** A rotina de dados publica todos os tickers e títulos. Assim, os arquivos baixados não revelam o que o usuário tem.
6. **Backup cifrado.** A exportação gera um arquivo `.carteira`, cifrado com AES-GCM de 256 bits. A chave vem da senha, por PBKDF2-SHA-256 com 600 mil iterações ou mais. O usuário escolhe onde salvar.
7. **Modo discreto e bloqueio.** Um toque oculta todos os valores. O bloqueio por senha ao abrir é opcional e vem desligado.
8. **Resumo para conversa.** O resumo exportado sai só com percentuais, sem valores nem nomes de instituições. Traz a alocação atual contra o alvo, os meses de reserva, os alertas e o pior cenário. Incluir valores exige ação explícita.
9. **Teste automático.** Um teste de ponta a ponta falha se o app tentar qualquer requisição fora da própria origem.

## Política de investimento inicial

A política parte de três baldes e de um limite: a carteira não deve perder mais de 20% no pior cenário testado. Todos os números abaixo são parâmetros editáveis na tela Política, e já foram confirmados pelo dono do app, com um ajuste para o lado conservador.

### Reserva, com liquidez diária

- **Meta:** 12 meses do custo de vida mensal informado pelo usuário.
- **Ativos aceitos:** pós-fixados com resgate diário e FGC (CDB ou RDB, incluindo "cofrinhos"), Tesouro Selic e Tesouro Reserva.
- **Piso de qualidade:** 100% do CDI. Abaixo disso, o app alerta.
- **Prioridade no aporte:** abaixo de metade da meta, 100% do aporte vai para a reserva. Entre metade e a meta cheia, 50%. Com a meta cheia, nada.

### Carteira livre

É tudo o que está fora da reserva e da previdência. Os alvos somam 100%.

| Classe | Balde | Alvo | Faixa | Função |
| --- | --- | --- | --- | --- |
| Renda fixa pós-fixada | Médio prazo, 2 a 5 anos | 22% | 17% a 27% | Protege contra alta de juros |
| Renda fixa IPCA+ até 5 anos | Médio prazo | 16% | 12% a 20% | Protege o poder de compra |
| Renda fixa prefixada até 5 anos | Médio prazo | 8% | 6% a 10% | Ganha se os juros caírem |
| Renda fixa IPCA+ acima de 5 anos | Longo prazo | 18% | 13,5% a 22,5% | Juro real para o longo prazo |
| Ações Brasil | Longo prazo | 12% | 9% a 15% | Crescimento |
| FIIs | Longo prazo | 8% | 6% a 10% | Renda e imóveis |
| Exterior, por ETFs listados na B3 | Longo prazo | 13% | 9,75% a 16,25% | Proteção cambial e fora do Brasil |
| Cripto | Longo prazo | 3% | 2,25% a 3,75% | Aposta pequena, com teto |

As faixas seguem a regra 5/25: a menor entre 5 pontos percentuais e 25% do alvo. O médio prazo soma 46% e o longo prazo, 54%.

### Limites

- **Cripto:** teto absoluto de 5% da carteira livre.
- **Emissor bancário:** no máximo 80% do limite do FGC por conglomerado, somando todos os produtos.
- **Ação individual:** no máximo 5% da carteira livre. O núcleo da classe é um ETF amplo.
- **FII individual:** no máximo 25% da classe FIIs.
- **Renda fixa sem FGC** (CRI, CRA, debêntures): fora da primeira versão.
- **Vencimentos do médio prazo:** distribuídos em escada, um por ano.

A previdência conta no patrimônio e no teste de cenários, mas fica fora dos alvos, porque o aporte dela é automático.

## Teste de cenários

No pior cenário, a alocação-alvo perde 18,38%, abaixo do limite de 20%. Os choques são premissas iniciais inspiradas em crises passadas, não previsões, e ficam editáveis.

| Classe (choque em %) | Crise global | Crise local | Juros e inflação em alta | Aperto global, real forte | Inverno cripto |
| --- | --- | --- | --- | --- | --- |
| Renda fixa pós-fixada | 0 | 0 | 0 | 0 | 0 |
| IPCA+ até 5 anos | −4 | −4 | −5 | −2 | 0 |
| Prefixada | −8 | −8 | −10 | −5 | 0 |
| IPCA+ acima de 5 anos | −20 | −20 | −20 | −10 | 0 |
| Ações Brasil | −50 | −45 | −25 | −15 | 0 |
| FIIs | −35 | −30 | −25 | −10 | 0 |
| Exterior | −20 | +12 | 0 | −35 | 0 |
| Cripto | −70 | −30 | −50 | −75 | −80 |
| Crédito privado (só na previdência) | −5 | −4 | −1 | −2 | 0 |
| **Perda da carteira livre** | **−18,38** | **−12,02** | **−11,70** | **−11,92** | **−2,40** |

- A perda de um cenário é a soma de peso vezes choque de cada classe.
- O app calcula sobre o patrimônio total: a reserva entra com choque zero e a previdência, conforme a composição informada, com a linha própria para crédito privado.
- Se o pior cenário passar da tolerância, o app sugere reduzir a classe que mais pesa na perda, primeiro pelos aportes.
- A tela mostra a perda de cada cenário em reais e em percentual.

## Motor de sugestões

O motor é uma função pura: recebe carteira, política, dados de mercado e data, e devolve uma lista ordenada de sugestões, cada uma com o seu motivo.

### Aporte do mês

1. O usuário informa o valor do aporte.
2. O motor separa a parte da reserva, conforme a cobertura atual.
3. O restante vai para as classes com maior déficit em reais frente ao alvo, já contando o aporte.
4. Cada aporte usa no máximo três classes. Parcelas abaixo de R$ 100 se juntam à classe de maior déficit.
5. Dentro da classe, o motor indica o tipo de ativo: indexador em falta, ano vago na escada, emissor abaixo do limite.
6. Antes de mostrar, o motor confere os limites e recalcula o pior cenário.
7. O usuário executa na corretora e registra as compras. O plano vira histórico.

### Rebalanceamento

- Classe fora da faixa gera alerta.
- A correção vem primeiro pelos aportes. Venda só é sugerida se os aportes não corrigirem o desvio em 6 meses.
- Toda sugestão de venda mostra o imposto estimado. Para ações, mostra também o total vendido no mês frente à isenção.
- Renda fixa com vencimento não entra em sugestão de venda. Se o usuário insistir, o app mostra o custo.
- Venda fora do plano passa por espera de 72 horas: o app guarda a intenção e pergunta de novo depois.

### Alertas

- Vencimento nos próximos 30 dias.
- Reserva abaixo da meta, ou rendendo abaixo do piso.
- Classe fora da faixa, ou emissor acima do limite.
- Pior cenário acima da tolerância.
- Dados de mercado com mais de 5 dias úteis, ou backup com mais de 30 dias.
- Sobra de dedução do PGBL, a partir de outubro.
- Data de carência da previdência chegando.

### Termômetro de taxas

Compara a taxa de hoje com a própria história, sem opinião embutida.

- **Séries:** taxa real do Tesouro IPCA+ com prazo perto de 10 anos e taxa do Tesouro Prefixado perto de 3 anos.
- **Medida:** percentil da taxa de hoje nos últimos 10 anos, calculado pela rotina de dados.
- **Regra:** percentil 75 ou mais desloca o alvo da classe metade da faixa para cima. Percentil 25 ou menos, metade para baixo. A diferença sai da renda fixa pós-fixada, ou volta para ela.
- **Controle:** pode ser desligado na tela Política. Com os dois deslocamentos para cima, o pior cenário fica em 18,91%.

### Revisão mensal

1. Atualizar os saldos da reserva e da previdência.
2. Registrar ou importar as movimentações do mês.
3. Ler os alertas.
4. Decidir o aporte.
5. Anotar a decisão no diário.

### Formato de uma sugestão

Cada sugestão traz título, prioridade, motivo em uma frase, os números que a sustentam, a regra da política que a gerou e a ação proposta. O texto nunca diz "compre o ativo X": diz a classe, o tipo e o valor.

O diário guarda, para cada decisão, a data, o motivo e o que faria o usuário mudar de ideia. Cada ativo de renda variável guarda a sua tese.

## Ponte com o Claude

O app dá a disciplina; o julgamento de analista vem do Claude, numa conversa alimentada por um resumo que o usuário copia e cola.

- **Por que é manual:** uma conexão automática exigiria guardar a carteira num servidor. Copiar e colar mantém os dados no aparelho.
- **Resumo para conversa:** texto que começa com `RESUMO-CARTEIRA v1`, seguido de um JSON. Valores em reais só entram se o usuário ligar a opção.
- **Perguntas prontas:** botões que copiam o resumo junto com uma pergunta. São cinco: revisão mensal, destino do aporte, comparar ofertas de renda fixa, analisar um ativo e rever a política.
- **Ajuste de política:** quando a conversa termina numa mudança, o Claude devolve um bloco `AJUSTE-POLITICA v1`. O app mostra a diferença e o efeito nos cenários antes de aplicar, e registra no diário.
- **Validação:** o app recusa bloco malformado, alvos que não somam 100% e mudanças que quebram os limites.
- **Registro:** o parecer do Claude pode ser colado no diário de decisões.

Os dois blocos têm o formato abaixo. Os números são ilustrativos.

```json
{
  "type": "RESUMO-CARTEIRA",
  "version": 1,
  "asOf": "2026-11-03",
  "marketDataAsOf": "2026-10-30",
  "weights": { "reserva": 60.0, "carteiraLivre": 32.0, "previdencia": 8.0 },
  "reserve": { "targetMonths": 12, "coveredMonths": 7.5 },
  "allocation": { "rfPosFixada": 30.0, "rfIpcaCurta": 12.0, "rfPrefixada": 6.0, "rfIpcaLonga": 20.0, "acoesBrasil": 12.0, "fiis": 8.0, "exterior": 10.0, "cripto": 2.0 },
  "policy": { "targets": { "rfPosFixada": 22, "rfIpcaCurta": 16, "rfPrefixada": 8, "rfIpcaLonga": 18, "acoesBrasil": 12, "fiis": 8, "exterior": 13, "cripto": 3 }, "maxDrawdown": 20 },
  "scenarios": { "criseGlobal": -5.5, "criseLocal": -3.9 },
  "alerts": ["classe-fora-da-faixa:rfPosFixada"],
  "maturities": [{ "month": "2027-03", "class": "rfPrefixada", "pctOfTotal": 2.1 }]
}
```

```json
{
  "type": "AJUSTE-POLITICA",
  "version": 1,
  "date": "2026-11-03",
  "reason": "motivo em uma frase",
  "changes": [
    { "path": "targets.fiis", "from": 8, "to": 9 },
    { "path": "targets.rfPosFixada", "from": 22, "to": 21 }
  ]
}
```

As chaves das classes são `rfPosFixada`, `rfIpcaCurta`, `rfPrefixada`, `rfIpcaLonga`, `acoesBrasil`, `fiis`, `exterior` e `cripto`. Outros caminhos aceitos: `reserve.months`, `maxDrawdown`, `limits.criptoMaxPct`, `limits.issuerFgcPct` e `tiltEnabled`.

## Previdência (PGBL)

O módulo mostra quanto do saldo já é do participante e quanta dedução de IR ainda cabe no ano.

### Campos

- Contribuição própria mensal e contrapartida da empresa, em percentual da contribuição.
- Tabela de carência: anos de plano e o percentual da parte da empresa liberado em cada degrau.
- Saldo, informado na revisão mensal.
- Composição do fundo por classe, incluindo crédito privado, para o teste de cenários.
- Taxas de administração e de carregamento.
- Regime de tributação: indefinido, progressivo ou regressivo.

### Cálculos

- **Saldo garantido hoje:** parte própria mais a parte da empresa vezes o percentual já liberado.
- **Próximo degrau:** a data da próxima carência e o valor que ela libera.
- **Sobra de dedução:** 12% da renda bruta tributável anual menos as contribuições próprias do ano.
- **Economia estimada:** sobra vezes a alíquota marginal informada pelo usuário.

### Regras e avisos

- A contrapartida vem antes de qualquer outro investimento. Se o plano aceitar contribuição maior com contrapartida, o app sinaliza.
- A dedução exige declaração completa e contribuição ao INSS ou a regime próprio de previdência. Aposentados e pensionistas desses regimes estão dispensados dessa contribuição.
- A contribuição da empresa não entra no limite de 12%, que vale só para o que o participante paga.
- O aporte extra precisa estar concluído até 31 de dezembro. O app alerta a partir de outubro e recomenda fechar até o dia 26.
- No resgate, o IR incide sobre o valor total, e não só sobre o rendimento.
- No regime regressivo, a alíquota depende do tempo de cada contribuição. Resgatar antes de 2 anos paga 35%, então a previdência não conta como liquidez.
- Sem degraus intermediários de carência informados, o app usa o último degrau já atingido.
- O simulador mostra as tabelas progressiva e regressiva lado a lado.

## Parâmetros fiscais e limites

As regras fiscais ficam num único arquivo de parâmetros, com a data da conferência de cada uma. O Claude Code deve reconferir todas em fonte oficial antes de usar, e o app pede revisão todo janeiro.

| Regra | Valor | Situação | Fonte |
| --- | --- | --- | --- |
| IR da renda fixa (CDB, Tesouro) | 22,5% até 180 dias; 20% de 181 a 360; 17,5% de 361 a 720; 15% acima de 720 | Conferido em 10/2026 | [MyCapital](https://blog.mycapital.com.br/reforma-tributaria-2026-imposto-de-renda-investimentos/) |
| IOF em resgate antes de 30 dias | Regressivo, zera no 30º dia | Conferido em 10/2026 | [Renova Invest](https://renovainvest.com.br/blog/guia-definitivo-tabelas-ir-investimentos/) |
| LCI, LCA, CRI, CRA e debêntures incentivadas | Isentos para pessoa física. O governo voltou a defender tributação em 09/2026, sem lei aprovada | Conferido em 10/2026 | [MyCapital](https://blog.mycapital.com.br/reforma-tributaria-2026-imposto-de-renda-investimentos/) |
| Prazo mínimo de LCI e LCA pós-fixadas | 6 meses | Conferido em 10/2026 | [Renova Invest](https://renovainvest.com.br/blog/guia-definitivo-tabelas-ir-investimentos/) |
| Ações | 15% sobre o lucro; isenção se as vendas do mês somarem até R$ 20 mil; day trade 20% | Conferido em 10/2026 | [MyCapital](https://blog.mycapital.com.br/reforma-tributaria-2026-imposto-de-renda-investimentos/) |
| Dividendos | Isentos até R$ 50 mil por mês por empresa; acima disso, 10% na fonte | Conferido em 10/2026 | [MyCapital](https://blog.mycapital.com.br/reforma-tributaria-2026-imposto-de-renda-investimentos/) |
| JCP | 17,5% na fonte desde 01/2026 | Conferido em 10/2026 | [MyCapital](https://blog.mycapital.com.br/reforma-tributaria-2026-imposto-de-renda-investimentos/) |
| FIIs | Rendimento isento se o fundo tiver 100 cotistas ou mais e o cotista, menos de 10% das cotas; ganho na venda 20% | Conferido em 10/2026 | [Renova Invest](https://renovainvest.com.br/blog/guia-definitivo-tabelas-ir-investimentos/) |
| ETFs de renda variável | 15% sobre o ganho, sem a isenção de R$ 20 mil | Conferido em 10/2026 | [Renova Invest](https://renovainvest.com.br/blog/guia-definitivo-tabelas-ir-investimentos/) |
| ETFs de renda fixa | 25% se o prazo médio da carteira do fundo for de até 180 dias; 20% de 181 a 720; 15% acima de 720. Se o fundo não mantiver 75% em ativos do índice, 30%. Retido na fonte, sem come-cotas | Conferido em 10/2026 | [Lei 13.043/2014, art. 2º](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l13043.htm) |
| Cripto em corretora no Brasil | Isenção se as vendas do mês, somando todos os criptoativos, forem de até R$ 35 mil; acima, todo o ganho do mês paga de 15% a 22,5%, conforme o tamanho do ganho | Conferido em 10/2026 | [Lei 9.250/1995, art. 22](https://www.planalto.gov.br/ccivil_03/leis/l9250.htm), [Lei 8.981/1995, art. 21](https://www.planalto.gov.br/ccivil_03/leis/l8981.htm), [Perguntas e Respostas IRPF 2026](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf) |
| ETFs de cripto na B3 | Mesma regra dos ETFs de renda variável: 15% sobre o ganho, sem a isenção de R$ 20 mil | Conferido em 10/2026 | [Lei 11.033/2004, art. 3º](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm) |
| PGBL: dedução | Até 12% da renda bruta tributável, na declaração completa, com aporte até 31/12 | Conferido em 10/2026 | [B3 Bora Investir](https://borainvestir.b3.com.br/objetivos-financeiros/investir-melhor/veja-prazo-para-usar-aporte-em-pgbl-para-pagar-menos-ir-ou-aumentar-restituicao/) |
| PGBL: tabela regressiva | 35% até 2 anos, caindo 5 pontos a cada 2 anos, até 10% acima de 10 anos | Conferido em 10/2026 | [B3 Bora Investir](https://borainvestir.b3.com.br/objetivos-financeiros/investir-melhor/veja-prazo-para-usar-aporte-em-pgbl-para-pagar-menos-ir-ou-aumentar-restituicao/) |
| PGBL: escolha do regime | Pode ser feita até o benefício ou o primeiro resgate, e é irretratável | Conferido em 10/2026 | [Lei 14.803/2024](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14803.htm) |
| FGC | R$ 250 mil por CPF e por conglomerado; teto de R$ 1 milhão a cada 4 anos. O projeto que eleva o limite aguarda despacho no Senado | Conferido em 10/2026 | [Contadores CNT](https://contadores.cnt.br/projetos/54/noticias/empresariais/2026/02/09/risco-bancario-em-debate-o-que-o-investidor-precisa-saber-sobre-o-fgc.html), [Senado](https://www25.senado.leg.br/web/atividade/materias/-/materia/174115) |
| Tesouro Direto: custódia | 0,20% ao ano; isenta até R$ 10 mil no Tesouro Selic e no Tesouro Reserva | Conferido em 10/2026 | [InvestNews](https://investnews.com.br/financas/tesouro-direto-como-investir-todo-mes-a-partir-de-r-30) |
| Tesouro Reserva | Rende a Selic, sem marcação a mercado, com resgate a qualquer hora. No lançamento, só pelo Banco do Brasil | Conferido em 10/2026 | [meutudo](https://meutudo.com.br/blog/noticias/2026/05/13/tesouro-reserva-rende-pela-selic-e-funciona-24h-veja-como-investir/) |

## Telas

São onze telas, pensadas para uso com uma mão no iPhone.

| Tela | O que mostra |
| --- | --- |
| Início | Patrimônio, meses de reserva cobertos, alocação atual contra o alvo, alertas e o botão do aporte do mês |
| Aporte do mês | Campo de valor, distribuição sugerida com os motivos, checagem de limites e lista do que executar |
| Carteira | Posições por balde e classe, detalhe de cada posição, lançamento manual e importação de planilha |
| Reserva | Saldos dos cofrinhos, rendimento estimado pelo CDI e conciliação com o saldo do banco |
| Previdência | Parte própria e da empresa, carência, saldo garantido e simulador de dedução |
| Política | Meta da reserva, alvos e faixas, limites, choques dos cenários, termômetro e parâmetros fiscais |
| Cenários | Perda por cenário em reais e em percentual, e a classe que mais pesa |
| Revisão mensal | Checklist do mês, diário de decisões e teses por ativo |
| Ferramentas | Comparador de renda fixa líquido de IR, equivalência entre LCI ou LCA e CDB, projeção de patrimônio |
| Conversa com o Claude | Gera o resumo, traz as perguntas prontas e importa ajustes de política |
| Ajustes | Backup e restauração, bloqueio, modo discreto, data dos dados de mercado e apagar tudo |

- Alvos de toque de pelo menos 44 pontos e respeito à área segura do iPhone.
- Tema claro e escuro, seguindo o sistema.
- Números e datas em formato brasileiro.
- Nenhum significado transmitido só por cor.
- Tudo funciona sem rede; só a atualização de preços precisa de conexão.

Na primeira abertura, um roteiro curto pede o custo mensal, os saldos da reserva e os dados da previdência. Também oferece dados fictícios para explorar o app.

## Modelo de dados

Tudo fica em IndexedDB, em tabelas versionadas e com migração entre versões.

| Entidade | Campos principais |
| --- | --- |
| `Policy` | `reserveMonths`, `monthlyCost`, `targets[]`, `bands`, `limits`, `scenarios[]`, `tiltEnabled`, `maxDrawdown` |
| `Institution` | `name`, `conglomerate`, `fgcCovered` |
| `Position` | `bucket`, `assetClass`, `instrumentType`, `institutionId`, `indexer`, `rate`, `startDate`, `maturityDate`, `liquidity`, `ticker`, `quantity`, `costBasis` |
| `Lot` | `positionId`, `date`, `amount`, `quantity`. Serve ao IR por prazo e ao custo médio |
| `Transaction` | `date`, `type` (`buy`, `sell`, `deposit`, `withdraw`, `income`, `contribution`), `positionId`, `amount`, `quantity`, `fees`, `note` |
| `PensionPlan` | `ownMonthly`, `matchPct`, `vestingTable[]`, `balances[]`, `composition`, `fees`, `taxRegime` |
| `ContributionPlan` | `date`, `amount`, `splits[]`, `status` (`planned`, `done`) |
| `DecisionLog` | `date`, `type`, `reason`, `wouldChangeIf`, `relatedIds` |
| `Thesis` | `positionId`, `text`, `reviewDate` |
| `MarketSnapshot` | `asOf`, `indices`, `treasury`, `b3Prices`, `thermometer` |
| `TaxParams` | `rule`, `value`, `verifiedAt`, `source` |
| `AppSettings` | `discreetMode`, `lockEnabled`, `lastBackupAt`, `schemaVersion` |

### Convenções

- Dinheiro em centavos inteiros. Taxas e quantidades com biblioteca decimal, nunca ponto flutuante.
- Datas no formato `YYYY-MM-DD`, sem hora, no fuso de São Paulo.
- Juros em dias úteis, base 252, com o calendário de feriados publicado pela rotina de dados.
- Identificadores UUID. Todo registro tem `createdAt` e `updatedAt`.

### Rendimento da reserva

- O saldo estimado soma os lotes, cada um corrigido pelo CDI diário vezes o percentual contratado, nos dias úteis.
- O IR estimado sai por lote, conforme o prazo de cada um.
- Na conciliação, o usuário informa o saldo do banco e o app registra a diferença.

## Dados de mercado

Uma rotina agendada baixa dados públicos uma vez por dia útil e publica arquivos JSON junto com o app.

| Dado | Fonte | Arquivo publicado | Situação |
| --- | --- | --- | --- |
| CDI e Selic diários, Selic meta, IPCA mensal e dólar PTAX | API de séries do Banco Central (SGS), pública e sem chave | `indices.json` | Validado no marco 0 |
| Taxas e preços dos títulos do Tesouro Direto, com histórico | [CSV aberto do Tesouro Transparente](https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto), atualizado todo dia | `treasury.json` e `thermometer.json` | Validado no marco 0 |
| Fechamento de ações, FIIs, ETFs e BDRs | [Cotações históricas da B3](https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/mercado-a-vista/cotacoes-historicas/) (arquivo COTAHIST) | `b3.json` | Validado no marco 0 |
| Feriados nacionais | Calendário da ANBIMA | `holidays.json` | Validado no marco 0 |
| Cripto em reais | API pública do Mercado Bitcoin, com a Coinbase de reserva, sem chave | `crypto.json` | Opcional; validado no marco 0 |

- **Tesouro Reserva:** não aparece no CSV do Tesouro Transparente. Como rende a Selic sem marcação a mercado, o app estima o saldo pela Selic diária (série 11 do SGS).
- **Cripto:** a Binance ficou de fora porque bloqueia os servidores do GitHub. O resultado de cada fonte está em `docs/sources.md`.
- **Agenda:** dias úteis à noite, fora da hora cheia. Exemplo em UTC: `17 1 * * 2-6`.
- **Atividade:** a rotina grava os arquivos no repositório. O commit diário mantém a agenda ativa, porque o [GitHub desativa agendas](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) após 60 dias sem atividade.
- **Falha de fonte:** o arquivo anterior é mantido e `meta.json` marca a fonte como atrasada. A rotina nunca derruba a publicação.
- **Validade:** o app mostra a data de cada dado e alerta após 5 dias úteis sem atualização.
- **Alternativas para a B3, nesta ordem:** outro arquivo público da própria B3; fonte não oficial por biblioteca; API gratuita com chave guardada como segredo do repositório.
- **Previdência:** não tem fonte automática. O saldo é digitado na revisão mensal.
- **Importação de planilha:** leitor genérico com mapeamento de colunas. Inclui uma predefinição para o extrato da [Área do Investidor da B3](https://borainvestir.b3.com.br/tipos-de-investimentos/renda-fixa/confira-seus-ativos-de-renda-fixa-na-area-do-investidor-b3/), validada com um arquivo de exemplo de valores alterados.

## Pilha técnica e repositório

A pilha é comum e sem servidor, para o Claude Code manter com facilidade.

- Vite, React e TypeScript em modo estrito.
- Dexie sobre IndexedDB. Zod valida dados importados e arquivos de mercado.
- `vite-plugin-pwa` gera o service worker e o manifesto.
- Biblioteca decimal para taxas e `date-fns` para datas.
- SheetJS lê planilhas, carregado só na importação.
- Gráficos em SVG próprio ou biblioteca leve, sem CDN.
- Vitest para o motor e as contas. Playwright com WebKit para as telas.
- Rotina de dados em Node e TypeScript, na pasta `pipeline/`.

```text
/
├─ SPEC.md                 este documento
├─ src/
│  ├─ domain/              tipos, política e contas financeiras (puro)
│  ├─ engine/              motor de sugestões e cenários (puro)
│  ├─ data/                Dexie, migrações, backup cifrado, importadores
│  ├─ market/              leitura de /data/*.json
│  ├─ ui/                  telas e componentes
│  └─ demo/                dados fictícios
├─ pipeline/               rotina que baixa e resume dados públicos
├─ public/data/            arquivos de mercado publicados
├─ tests/                  casos de referência e testes de ponta a ponta
└─ .github/workflows/      data.yml (agenda) e deploy.yml (Pages)
```

As pastas `domain/` e `engine/` não importam nada de interface, rede ou armazenamento.

A construção roda no Windows, com Node LTS e Git. Cada marco termina publicado no GitHub Pages e testado no iPhone pelo endereço real, porque o service worker exige HTTPS.

## Marcos de construção e critérios de aceite

São sete marcos, feitos um de cada vez, com teste no iPhone ao fim de cada um. O primeiro valida as fontes de dados e o iPhone antes de qualquer tela.

| Marco | Entrega | Aceite |
| --- | --- | --- |
| 0. Validação | Testar cada fonte de dados a partir de um runner do GitHub. Testar instalação, armazenamento persistente, importação e exportação de arquivo num iPhone real | `docs/sources.md` registra o que funcionou e as alternativas escolhidas |
| 1. Esqueleto | PWA instalável, navegação, armazenamento, backup cifrado, dados fictícios e CSP | Instala no iPhone, abre offline e o backup restaura idêntico |
| 2. Carteira | Posições, lotes, transações, reserva com rendimento pelo CDI, previdência com carência e rotina de dados | Saldos batem com os casos de referência |
| 3. Política e aporte | Tela Política, alocação atual contra o alvo e sugestão de aporte | Casos de referência do motor passam |
| 4. Risco e disciplina | Cenários, alertas, rebalanceamento, termômetro, revisão mensal e diário | Perdas por cenário iguais às deste documento para a alocação-alvo |
| 5. Ferramentas | Comparador de renda fixa, simulador do PGBL, projeção, importação de planilha e ponte com o Claude | O resumo sai sem valores, um ajuste de política inválido é recusado e a importação lê o arquivo de exemplo |
| 6. Acabamento | Acessibilidade, tema escuro, desempenho, auditoria de privacidade e guia de uso | O teste de rede bloqueada passa e não há dado pessoal no repositório |

### Testes obrigatórios

- CDB a 100% e a 110% do CDI por 1, 180, 361 e 721 dias: bruto, IR e líquido.
- Equivalência entre LCI ou LCA e CDB: taxa equivalente = taxa isenta ÷ (1 − alíquota do prazo).
- Tesouro IPCA+ e prefixado: valor de mercado a partir do preço do dia.
- Regra de aporte nas três faixas de cobertura da reserva.
- Faixas 5/25 e detecção de classe fora da faixa.
- Carência da previdência nas datas de borda.
- Sobra de dedução do PGBL.
- Backup: cifrar, restaurar, senha errada e arquivo corrompido.
- Privacidade: nenhuma requisição fora da própria origem.

## Fora do escopo

A primeira versão não faz nada disto:

- Conexão com bancos ou corretoras, e envio de ordens.
- Cotação em tempo real e notificações push.
- Sincronização automática entre aparelhos.
- IA embutida no app e recomendação automática de ativo específico. A análise com IA acontece na conversa com o Claude.
- Apuração completa de IR e emissão de DARF. A versão inicial só estima e avisa.
- Crédito privado sem FGC, opções, futuros e day trade.
- Indicadores fundamentalistas de ações e FIIs.

## Em aberto

Estes pontos dependem do dono do app e não travam o marco 0.

- [x] Confirmar os alvos e as faixas da política inicial.
- [x] Confirmar a inclusão de exterior por ETFs listados na B3.
- [x] Confirmar a regra de prioridade da reserva: 100% do aporte abaixo de metade da meta e 50% até a meta cheia.
- [x] Previdência: verificar se a empresa acompanha uma contribuição maior que a atual.
- [x] Previdência: anotar perfil de investimento e taxas.
- [ ] Previdência: confirmar se a carência tem degraus entre o terceiro e o nono ano.
- [x] Definir a conta do GitHub.
- [x] Definir se o bloqueio por senha vem ligado.
- [x] Reconferir os itens "A confirmar" dos parâmetros fiscais.

## Fontes

Páginas abertas entre 10 e 12 de outubro de 2026.

- [Reforma tributária 2026 e o IR dos investimentos, MyCapital](https://blog.mycapital.com.br/reforma-tributaria-2026-imposto-de-renda-investimentos/)
- [Tabelas de IR em investimentos, Renova Invest](https://renovainvest.com.br/blog/guia-definitivo-tabelas-ir-investimentos/)
- [Prazo e regras da dedução do PGBL, B3 Bora Investir](https://borainvestir.b3.com.br/objetivos-financeiros/investir-melhor/veja-prazo-para-usar-aporte-em-pgbl-para-pagar-menos-ir-ou-aumentar-restituicao/)
- [O que o investidor precisa saber sobre o FGC, Contadores CNT](https://contadores.cnt.br/projetos/54/noticias/empresariais/2026/02/09/risco-bancario-em-debate-o-que-o-investidor-precisa-saber-sobre-o-fgc.html)
- [PLP 135/2026, Senado Federal](https://www25.senado.leg.br/web/atividade/materias/-/materia/174115)
- [Tesouro Reserva, meutudo](https://meutudo.com.br/blog/noticias/2026/05/13/tesouro-reserva-rende-pela-selic-e-funciona-24h-veja-como-investir/)
- [Custos do Tesouro Direto, InvestNews](https://investnews.com.br/financas/tesouro-direto-como-investir-todo-mes-a-partir-de-r-30)
- [Cripto no IR 2026, brapi](https://brapi.dev/blog/como-declarar-criptomoedas-imposto-renda-2026)
- [Taxas dos títulos do Tesouro Direto, Tesouro Transparente](https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto)
- [Cotações históricas, B3](https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/historico/mercado-a-vista/cotacoes-historicas/)
- [Renda fixa na Área do Investidor, B3 Bora Investir](https://borainvestir.b3.com.br/tipos-de-investimentos/renda-fixa/confira-seus-ativos-de-renda-fixa-na-area-do-investidor-b3/)
- [GitHub Pages: disponibilidade por plano](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Actions: eventos e agenda](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub Actions: cobrança](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Política de armazenamento do WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Lei 13.043/2014, ETFs de renda fixa, Planalto](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l13043.htm)
- [Lei 9.250/1995, isenção de pequeno valor, Planalto](https://www.planalto.gov.br/ccivil_03/leis/l9250.htm)
- [Lei 8.981/1995, alíquotas do ganho de capital, Planalto](https://www.planalto.gov.br/ccivil_03/leis/l8981.htm)
- [Lei 11.033/2004, renda variável, Planalto](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm)
- [Lei 9.532/1997, dedução da previdência, Planalto](https://www.planalto.gov.br/ccivil_03/leis/l9532.htm)
- [Lei 14.803/2024, escolha do regime, Planalto](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14803.htm)
- [Perguntas e Respostas IRPF 2026, Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf)
