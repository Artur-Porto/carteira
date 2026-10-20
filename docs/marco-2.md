# Marco 2: carteira

Construído em 19/10/2026. Aceite do SPEC: saldos batem com os casos de referência. O teste no iPhone está no fim deste arquivo.

## O que foi entregue

- **Rotina de dados.** `pipeline/update.ts` baixa as fontes validadas no marco 0 e publica `public/data/*.json`, no formato de `src/market/files.ts`. O workflow `data` roda às 22h17 de Brasília, de segunda a sexta, grava os arquivos no repositório e dispara a publicação.
- **Carteira.** Lançamento manual de posições de renda fixa de banco, Tesouro Direto, ações, FIIs, ETFs, BDRs e cripto. Cada posição tem detalhe com valor de hoje, aplicado, rendimento, IR e IOF estimados, lotes e movimentações. Movimentações podem ser registradas, corrigidas e apagadas.
- **Valor de hoje.**
  - Renda fixa pós-fixada: CDI ou Selic diários pelo método da B3.
  - Prefixada e IPCA+ de banco: curva em dias úteis.
  - Tesouro Direto: preço do dia.
  - Bolsa: fechamento da B3. Cripto: preço do Mercado Bitcoin.
  - Sem preço ou taxa, a posição entra pelo valor aplicado, e a tela diz por quê.
- **Reserva.** Saldo bruto e líquido, meses de custo de vida cobertos, custo de vida editável e aviso de piso abaixo de 100% do CDI. Cada posição recebe o saldo informado pelo banco, e o app registra a diferença.
- **Previdência.** Cadastro do plano com tabela de carência, saldo mensal, percentual liberado, saldo garantido e próximo degrau, com data e valor. O simulador da dedução fica para o marco 5.
- **Primeiros passos.** "Começar do zero" leva a um roteiro curto, com custo de vida, saldos da reserva e plano de previdência. Toda etapa pode ser pulada.
- **Início.** Patrimônio a preço de hoje, meses de reserva pelo valor líquido e aviso quando os dados de mercado passam de 5 dias úteis.
- **Ajustes.** Data de cada fonte de mercado, aviso de fonte atrasada e botão para atualizar.
- **Parâmetros fiscais** em `src/domain/tax.ts`, cada regra com a data e a fonte oficial da conferência.
- **Dados fictícios** refeitos, com um resgate e um saldo informado no cofrinho.
- **Versão 2 dos dados**, com migração automática do aparelho e dos backups do marco 1.

## Decisões

1. **Lotes, quantidade e custo vêm das movimentações.** O SPEC lista `Lot` como tabela e `quantity` e `costBasis` na posição. Um resgate por valor tira de cada lote conforme o que ele rendeu, e isso depende do CDI do período; lotes guardados ficariam velhos sempre que uma taxa ou uma movimentação anterior mudasse. A versão 2 dos dados apaga a tabela de lotes e esses dois campos. As movimentações do marco 1 já tinham a mesma informação, e nada se perde.
2. **Saldo do banco.** Entidade nova, `Reconciliation`, com posição, data e saldo. O saldo informado se reparte entre os lotes, na proporção do valor de cada um, e cada lote passa a render a partir da sua parte. O app guarda o saldo, não a diferença: se uma movimentação anterior for corrigida, o valor naquela data continua igual ao do banco.
3. **Método da B3 para o CDI.**
   - Cada dia útil multiplica por (1 + TDI × percentual), com a TDI do SGS em 8 casas.
   - O produto acumulado é truncado em 16 casas e o fator da data, arredondado em 8.
   - As contas usam inteiros exatos.
   - Os dias ainda sem CDI publicado repetem a última taxa, e a tela avisa.
4. **Arredondamento.** O valor de cada lote, o IR e o IOF são arredondados ao centavo. A conciliação reparte os centavos pelo método dos maiores restos, de modo que a soma dos lotes bata exatamente com o saldo digitado.
5. **Meses de reserva pelo valor líquido**, depois do IR estimado, porque a reserva serve para ser sacada. É o lado conservador.
6. **Tesouro pelo PU base**, que no arquivo do Tesouro Transparente é igual ao PU de venda: o valor que o investidor recebe ao vender hoje. A taxa de custódia ainda não entra no valor.
7. **Ações, FIIs, ETFs e cripto a custo médio**, como pede a Receita. O IR delas depende do total vendido no mês, por isso aparece só nas sugestões de venda do marco 4.
8. **IPCA+ de banco é estimativa.** O IPCA de cada mês se espalha pelos dias corridos do mês, e os meses ainda não publicados repetem o último. Emissores usam regras próprias de aniversário e defasagem, que o saldo do banco corrige.
9. **Contagem de anos pela Lei 810/1949.** Um plano que começou em 29/02 completa o ano em 01/03.
10. **Quantidades ficam ocultas no modo discreto**, como os valores, porque também revelam patrimônio.
11. **Tickers fictícios.** O demo do marco 1 usava FIIB11, que é um FII real e receberia o preço dele. Os FIIs fictícios passam a usar códigos de cinco letras, que a B3 não usa.
12. **Datas.** O calendário próprio em `src/domain/calendar.ts` faz o que o SPEC pedia do date-fns, com a regra da Lei 810 e os feriados da ANBIMA, sem uma dependência a mais.

## Parâmetros fiscais conferidos

Conferidos em 19/10/2026, antes do uso no app, no texto compilado do Planalto e, para a Lei 810, no portal da Câmara.

| Regra | Valor | Fonte oficial |
| --- | --- | --- |
| IR da renda fixa (CDB, Tesouro) | 22,5% até 180 dias; 20% de 181 a 360; 17,5% de 361 a 720; 15% acima de 720. A MP 1.303/2025, que mudaria a tabela, está com a vigência encerrada | [Lei 11.033/2004, art. 1º](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm) |
| IOF no resgate antes de 30 dias | 96% do rendimento no 1º dia, caindo até 3% no 29º; zero a partir do 30º | [Decreto 6.306/2007, art. 32 e Anexo](https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm) |
| LCI e LCA | Isentas de IR para pessoa física | [Lei 11.033/2004, art. 3º, II e IV](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm) |
| LCA | IOF com alíquota zero | [Decreto 6.306/2007, art. 32, § 2º, V](https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm) |
| Contagem de anos e meses | Do dia do início ao mesmo dia do ano ou mês seguinte; sem esse dia, o prazo termina no primeiro dia seguinte | [Lei 810/1949, Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/1940-1949/lei-810-6-setembro-1949-364059-publicacaooriginal-1-pl.html) |

As demais regras da tabela do SPEC entram em `src/domain/tax.ts` no marco que as usar, depois da mesma conferência.

## Casos de referência

Os valores esperados vêm de uma implementação independente das mesmas regras, em Python, com a biblioteca `decimal`. O app bateu com todos, centavo a centavo. Estão em `tests/unit/valuation.test.ts` e `tests/unit/rules.test.ts`. Todas as posições são fictícias. O calendário é o da ANBIMA, e o CDI é constante em 0,050788% ao dia, cerca de 13,65% ao ano.

**CDB de R$ 10.000,00 aplicado em 06/01/2025** (teste obrigatório do SPEC):

| CDI | Dias | Bruto | IOF | IR | Líquido |
| --- | --- | --- | --- | --- | --- |
| 100% | 1 | R$ 10.005,08 | R$ 4,88 | R$ 0,05 | R$ 10.000,15 |
| 100% | 180 | R$ 10.649,85 | — | R$ 146,22 (22,5%) | R$ 10.503,63 |
| 100% | 181 | R$ 10.649,85 | — | R$ 129,97 (20%) | R$ 10.519,88 |
| 100% | 361 | R$ 11.353,46 | — | R$ 236,86 (17,5%) | R$ 11.116,60 |
| 100% | 721 | R$ 12.857,43 | — | R$ 428,61 (15%) | R$ 12.428,82 |
| 110% | 1 | R$ 10.005,59 | R$ 5,37 | R$ 0,05 | R$ 10.000,17 |
| 110% | 721 | R$ 13.184,59 | — | R$ 477,69 (15%) | R$ 12.706,90 |

Com 180 e 181 dias o saldo é o mesmo, porque as duas datas caem num fim de semana; só a alíquota muda. O teste cobre também 30 dias, os dias ainda sem CDI publicado, o vencimento e a isenção da LCA.

**Cofrinho a 100% do CDI:**

1. Aplicações de R$ 1.000,00 em 10/03/2025 e em 02/06/2025.
2. Resgate de R$ 1.500,00 em 01/09/2025. Os lotes valiam R$ 1.063,36 e R$ 1.033,03. O primeiro sai inteiro e, do segundo, saem R$ 436,64, deixando R$ 577,32 do valor aplicado. O rendimento resgatado é de R$ 77,32.
3. Em 01/12/2025, o banco mostra R$ 616,59, R$ 0,50 a mais que a estimativa de R$ 616,09. O saldo do app nessa data passa a ser R$ 616,59.
4. Em 02/03/2026, o bruto é R$ 635,99, com IR de R$ 11,73 (20%) e líquido de R$ 624,26.

**Tesouro, pelo preço do dia 15/10/2026:**

- **IPCA+ 2035 a R$ 2.686,72.** Compras de 2,00 títulos por R$ 5.200,00 e de 0,85 por R$ 2.300,00; venda de 1,00 em 15/01/2026 por R$ 2.650,00. A venda sai do lote mais antigo, com custo de R$ 2.600,00 e ganho de R$ 50,00. Sobram R$ 4.970,43 brutos, com IR de R$ 15,18 só no lote com ganho.
- **Prefixado 2029 a R$ 768,69.** São 6,90 títulos comprados por R$ 5.000,00 em 05/02/2026. Valem R$ 5.303,96, com IR de 20% (252 dias) de R$ 60,79.

**Ações a custo médio:** compras de 100 por R$ 1.000,00 e de 100 por R$ 1.200,00, com R$ 5,00 de custos em cada. Na venda de 50 por R$ 700,00, com R$ 2,50 de custos, saem R$ 552,50 de custo e o ganho é de R$ 145,00. Ficam 150 ações, com custo de R$ 1.657,50.

**Prefixado e IPCA+ de banco:**

- R$ 10.000,00 a 12,30% ao ano, de 05/02 a 15/10/2026, em 172 dias úteis: R$ 10.823,96.
- IPCA + 7% com IPCA fictício de 0,33%, 0,70% e 0,56%, de 15/01 a 20/03/2026: R$ 10.243,09.

**Carência da previdência** (teste obrigatório do SPEC). Plano iniciado em 01/03/2023, com degraus de 20% em 2 anos até 100% em 10 anos:

- 0% em 28/02/2025 e 20% em 01/03/2025; 20% em 28/02/2027 e 40% em 01/03/2027.
- Plano iniciado em 29/02/2024 completa 1 ano em 01/03/2025.
- Sem degraus intermediários, vale o último atingido.
- Com R$ 31.000,00 de cada parte, o saldo garantido é de R$ 37.200,00. O próximo degrau, em 01/03/2027, libera mais R$ 6.200,00.

## Rotina de dados

| Arquivo | Conteúdo | Fonte |
| --- | --- | --- |
| `indices.json` | CDI e Selic de cada dia útil desde 2010, mudanças da meta da Selic, IPCA mensal desde 2010 e dois anos de PTAX | Banco Central, SGS |
| `treasury.json` | Taxas e preços de todos os títulos do Tesouro Direto no último dia, em centavos | Tesouro Transparente |
| `thermometer.json` | Percentil de 10 anos das taxas do IPCA+ perto de 10 anos e do Prefixado perto de 3 anos, com a série mensal | Tesouro Transparente |
| `b3.json` | Fechamento de todas as ações, FIIs, ETFs e BDRs do mercado à vista, cerca de 1.440 papéis | B3, COTAHIST |
| `holidays.json` | Feriados nacionais de 2001 a 2099 | ANBIMA |
| `crypto.json` | Preço em reais de todos os criptoativos cotados em real, cerca de 400 | Mercado Bitcoin; Coinbase de reserva |
| `meta.json` | Situação de cada fonte na última execução | A própria rotina |

- **Incremental.** Por noite, o SGS só é consultado nos últimos 60 dias, que substituem o que estava publicado, para pegar revisões. O SGS leva cerca de 20 s por fatia de 10 anos. O resultado incremental foi conferido byte a byte contra o download completo.
- **Falhas.** Uma fonte que falha mantém o arquivo anterior e aparece como atrasada em `meta.json`. As outras seguem, e a execução termina com erro para o problema aparecer na aba Actions. Nenhuma fonte volta para um dado mais velho que o publicado.
- **Calendário.** De 2010 a 2026, os 4.217 dias com CDI coincidem exatamente com os dias úteis da ANBIMA.
- **Achado.** Na série 432, a meta da Selic, o SGS estoura o próprio tempo limite em janelas de 9 anos e responde uma página HTML com código 200. A rotina usa fatias de 3 anos e rejeita qualquer resposta que não seja JSON.
- **Tamanho.** Os arquivos somam cerca de 450 KB, ou 55 KB comprimidos. O app só baixa os arquivos que a rotina atualizou e guarda tudo no aparelho para uso offline.
- **Primeira execução no GitHub:** 19/10/2026, com as cinco fontes em dia e o commit "Dados de mercado de 19/10/2026".

## Testes

- **Unidade** (`npm test`), 81 casos:
  - casos de referência;
  - regras fiscais nas bordas;
  - carência;
  - calendário e Lei 810;
  - leitura de números digitados no formato brasileiro;
  - endereços das telas;
  - formatos das fontes de dados, com cópias fictícias de cada uma;
  - carregador dos arquivos de mercado;
  - backup;
  - migração do aparelho e dos backups do marco 1 para a versão 2;
  - nenhum estilo embutido no código, que a CSP bloquearia.
- **Ponta a ponta** (`npm run e2e`), no WebKit com tela de iPhone e no Chromium:
  - primeiros passos, completos e pulados;
  - posição de bolsa com compra, venda, custo médio e exclusão;
  - CDB com saldo do banco que vira o valor da posição e da reserva;
  - plano de previdência com saldo garantido e próximo degrau;
  - todas as telas;
  - sessão completa sem requisição fora da própria origem e sem violação da CSP, agora com o download dos dados de mercado;
  - dados de mercado disponíveis offline.
- **Achado no WebKit.**
  - No WebKit dos testes, todo `<select>` gera um aviso de atributo de estilo bloqueado pela CSP, mesmo uma lista simples, sem React e sem script. O Chromium não gera.
  - O aviso não é requisição de rede, e as listas aparecem normalmente nas telas.
  - O teste de privacidade passou a ignorar só avisos de atributo de estilo e continua falhando em qualquer outra violação.
  - Um teste de unidade garante que o código do app nunca escreve estilo embutido.
  - No iPhone, o passo 7 do roteiro confere as listas.

## Ajustes no SPEC.md

Aprovados pelo dono do app e aplicados no SPEC.md em 20/10/2026. A tabela do modelo de dados também passou a listar o campo `name` da posição, que existe desde o marco 1.

1. **Modelo de dados.**
   - `Lot` passa a ser calculado a partir de `Transaction`, e não guardado.
   - `Position` perde `quantity` e `costBasis`.
   - Entra `Reconciliation` (`positionId`, `date`, `balance`).
   - `MarketSnapshot` vira a tabela `market`, com o último arquivo baixado de cada fonte, fora do backup.
2. **Parâmetros fiscais.** As linhas do IR da renda fixa, do IOF e da isenção de LCI e LCA passam a citar as fontes oficiais acima, conferidas em 19/10/2026.
3. **Dados de mercado.** Registrar a atualização incremental do SGS, as fatias da série 432 e o horário da rotina.
4. **Pilha técnica.** Trocar "date-fns para datas" por "calendário próprio, com feriados da ANBIMA e a regra da Lei 810".

## Fica para depois

- **Taxa de custódia do Tesouro** (0,20% ao ano) no valor líquido: marco 5, com o comparador, que também a usa.
- **IR de ações, FIIs, ETFs e cripto:** marco 4, nas sugestões de venda.
- **Simulador da dedução do PGBL:** marco 5.
- **Tamanho do pacote:** o JavaScript passou de 500 KB, ou 172 KB comprimidos, e o construtor avisa. Fica para o marco 6, de desempenho.
- **Bloqueio por senha ao abrir:** aprovado para o marco 6 em 20/10/2026 e registrado no SPEC.md. Continua opcional e desligado de fábrica.

## Teste no iPhone

1. Abra o app pelo ícone. Em Mais → Ajustes → Sobre, confira "Carteira 0.2.0". Se aparecer 0.1.0, feche o app pelo seletor de apps e abra de novo.
2. O demo mudou. Em Ajustes, digite APAGAR, toque em **Apagar tudo** e depois em **Explorar com dados fictícios**.
3. **Início:** o patrimônio sai a preço de hoje, com a data dos dados de mercado. A reserva cobre cerca de 11 meses.
4. **Carteira → Cofrinho do Banco Fictício A:** confira os 4 lotes, o IR de cada um e o saldo informado em 30/09/2026.
5. Ainda no cofrinho, toque em **Registrar movimentação**, escolha Resgate e informe R$ 1.000,00. Os lotes devem diminuir a partir do mais antigo.
6. Toque em **Informar saldo do banco**, digite um valor perto da estimativa e salve. O valor da posição deve passar a ser o saldo digitado.
7. **Carteira → Adicionar posição:**
   - escolha ETF e digite IVVB11: devem aparecer o nome e o fechamento da B3;
   - depois, escolha Tesouro IPCA+: deve aparecer a lista de títulos do dia;
   - as listas de opções (Tipo, Título, Balde, Classe) devem abrir a roleta do iPhone e mostrar o texto inteiro;
   - não precisa salvar.
8. **Mais → Previdência:** saldo garantido de R$ 37.200,00 e próximo degrau em 01/03/2027.
9. **Mais → Ajustes → Dados de mercado:** toque em **Atualizar agora** e confira as datas.
10. **Offline:** ative o modo avião, feche o app e abra de novo. Os valores devem aparecer como antes. Depois, desative o modo avião.
11. Conte o resultado de cada passo e qualquer coisa estranha nas telas, principalmente nos formulários.
