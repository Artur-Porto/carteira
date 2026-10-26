# Marco 4: risco e disciplina

Construído em 25/10/2026. Aceite do SPEC: as perdas por cenário da alocação-alvo são iguais às da tabela do SPEC. O teste no iPhone está no fim deste arquivo.

Começou com o aval do dono do app antes do teste do marco 3 no iPhone. As decisões e os ajustes de SPEC propostos em `docs/marco-3.md` continuam esperando aprovação.

## O que foi entregue

- **Cenários**, em Mais → Cenários. Cada cenário mostra a perda em reais e em percentual e a classe que mais pesa, em três visões:
  - carteira livre hoje, contra a tolerância;
  - patrimônio total, com a reserva sem choque e a previdência pela composição de cada plano, com a linha do crédito privado;
  - alocação-alvo da política, que repete a tabela do SPEC.
- **Termômetro de taxas.**
  - O percentil de 10 anos do Tesouro IPCA+ perto de 10 anos e do Prefixado perto de 3 anos move os alvos de IPCA+ acima de 5 anos e de Prefixada até 5 anos.
  - A diferença sai da pós-fixada ou volta para ela.
  - Liga e desliga na Política, que mostra as leituras do dia. Os alvos movidos valem no Início, no aporte, nos alertas e no rebalanceamento.
- **Alertas no Início:**
  - pior cenário acima da tolerância;
  - reserva abaixo da meta e posição da reserva abaixo do piso;
  - vencimento em até 30 dias;
  - classe fora da faixa e emissor acima do limite do FGC;
  - degrau de carência da previdência em até 30 dias;
  - intenção de venda que já esperou 72 horas;
  - tese com a revisão vencida.
- **Rebalanceamento**, na tela Aporte:
  - cada classe fora da faixa diz em quantos meses os aportes a corrigem, com o aporte mensal previsto, um campo novo da Política;
  - se passar de 6 meses, o app sugere a venda, saindo primeiro das posições com menor ganho, com o IR estimado e as vendas de ações e de cripto do mês contra a isenção;
  - renda fixa nunca entra em venda: o app mostra o IR e o IOF de resgatar antes.
- **Pior cenário no aporte.** Com o pior cenário da carteira livre acima da tolerância, a classe que mais pesa na perda deixa de receber o aporte.
- **Revisão mensal:** checklist dos cinco passos do SPEC, marcado a partir dos registros do app, e um botão para concluir a revisão do mês.
- **Diário de decisões**, na Revisão, e "Anotar no diário" depois de salvar um plano de aporte.
- **Teses** das posições de renda variável, com data de revisão.
- **Espera de 72 horas.** Na posição, "Quero vender" anota o motivo e pede 72 horas. Depois disso, o app pergunta de novo. Desistir fica no diário; uma venda registrada fecha a intenção. O formulário de venda avisa quando a venda não passou pela espera, sem bloquear.
- **Política:** choques dos cenários editáveis, aporte mensal previsto e o conglomerado de cada banco com FGC, para somar bancos do mesmo grupo no limite.
- **Versão 0.4.0.**

## Decisões

1. **"Metade da faixa" é metade da distância do alvo até a borda da faixa.** É a única leitura que dá os 18,91% do SPEC com os dois deslocamentos para cima: +2,25 pontos no IPCA+ acima de 5 anos e +1 ponto na prefixada.
2. **Alvos movidos ganham faixa nova pela regra 5/25.** A meia largura de toda faixa passa a ser arredondada para baixo ao centésimo de ponto, para que nenhuma faixa tenha mais de duas casas. Os alvos iniciais não mudam.
3. **O termômetro usa a última leitura**, mesmo velha, com a data na tela. Hoje ela é de 15/10, por causa da parada do Tesouro Transparente. Um percentil de 10 anos muda devagar, e desligar o termômetro com dados velhos faria os alvos pularem.
4. **A tolerância vale para a carteira livre**, como no marco 3. O patrimônio total aparece em Cenários, sem limite próprio.
5. **Sem aporte mensal previsto, sem sugestão de venda.** Sem ele não dá para saber em quantos meses os aportes corrigem, e o app pede o campo em vez de sugerir venda.
6. **Tamanho da venda:** a menor que deixa 6 meses de aportes terminarem a correção. O dinheiro da venda fica na carteira livre.
7. **Ordem da venda:** primeiro as posições de menor ganho em percentual, que pagam menos imposto. Posições sem preço ficam de fora.
8. **IR na venda é estimativa:** prejuízo não paga e não é levado para meses seguintes; a isenção de cripto soma todos os criptoativos do mês, a leitura mais conservadora.
9. **Pior cenário acima da tolerância:** a classe que mais pesa na perda, se for da carteira livre, sai do aporte até o cenário voltar à tolerância.
10. **Alertas com 30 dias** de antecedência para vencimento e para carência. Dados de mercado velhos e backup antigo continuam nos avisos que já existiam no Início. O alerta da sobra do PGBL fica para o marco 5, que pede a renda anual.
11. **Revisão sem armazenamento próprio.** Saldos contam como atualizados se foram informados nos últimos 31 dias; plano e anotações contam no mês corrente. Concluir a revisão grava uma anotação do tipo "Revisão do mês".
12. **Intenção de venda como anotação do diário**, com um campo opcional novo, `saleIntent`. A política ganhou o campo opcional `monthlyContributionCents`. Os dois são opcionais, e backups antigos seguem válidos sem migração.

## Parâmetros fiscais conferidos

Conferidos em 25/10/2026, antes do uso no app, no texto compilado do Planalto. Em todos, a MP 1.303/2025 aparece com a vigência encerrada.

| Regra | Valor | Fonte oficial |
| --- | --- | --- |
| Ações, ETFs e BDRs em bolsa | 15% sobre o ganho | [Lei 11.033/2004, art. 2º, II](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm) |
| Isenção de ações | Vendas de ações no mercado à vista de até R$ 20 mil no mês; não alcança ETFs, BDRs e FIIs | [Lei 11.033/2004, art. 3º, I](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm) |
| FIIs | 20% sobre o ganho na venda das cotas | [Lei 8.668/1993, art. 18](https://www.planalto.gov.br/ccivil_03/leis/l8668.htm) |
| Cripto, isenção | Vendas de até R$ 35 mil no mês | [Lei 9.250/1995, art. 22, II](https://www.planalto.gov.br/ccivil_03/leis/l9250.htm) |
| Cripto, alíquotas | 15% até R$ 5 milhões de ganho; 17,5% até R$ 10 milhões; 20% até R$ 30 milhões; 22,5% acima | [Lei 8.981/1995, art. 21](https://www.planalto.gov.br/ccivil_03/leis/l8981.htm), na redação da Lei 13.259/2016 |

## Testes

- **Unidade** (`npm test`), 128 casos, 15 deles novos:
  - termômetro: os 18,91% do SPEC, deslocamento para baixo, desligado e sem leitura;
  - cenários sobre o patrimônio total, em percentual e em reais;
  - IR de venda em cada tipo de ativo, com as isenções e as faixas de cripto;
  - rebalanceamento: meses de correção, venda de ETF com prejuízo e de cripto dentro e fora da isenção, renda fixa sem venda, nada sem aporte previsto;
  - aporte que tira a classe mais pesada quando o pior cenário passa da tolerância;
  - alertas, intenção de venda madura em 72 horas e revisão mensal.
- **Ponta a ponta** (`npm run e2e`), no WebKit com tela de iPhone e no Chromium:
  - a alocação-alvo em Cenários repete a tabela do SPEC;
  - classe acima da faixa corrigida pelos aportes, e renda fixa sem venda;
  - anotação no diário e revisão do mês concluída;
  - intenção de venda, aviso no formulário de venda e desistência no diário.
  - O teste do aporte do marco 3 passou a desligar o termômetro, porque os alvos agora seguem as taxas do dia.

## Ajustes propostos no SPEC.md

Dependem da aprovação do dono do app.

1. **Termômetro:** "metade da faixa" é metade da distância entre o alvo e a borda da faixa, e o alvo movido ganha faixa pela regra 5/25.
2. **Faixas:** a meia largura é arredondada para baixo ao centésimo de ponto.
3. **Rebalanceamento:** a política tem um aporte mensal previsto; sem ele, o app não sugere venda.
4. **Parâmetros fiscais:** as linhas de ações, ETFs, FIIs e cripto passam a citar as fontes oficiais acima, conferidas em 25/10/2026.

## Fica para depois

- **Sobra de dedução do PGBL:** marco 5, com o simulador e a renda anual.
- **Compensação de prejuízo entre meses** no IR de venda: fora da primeira versão, que só estima.
- **Histórico da política** no diário quando ela é salva: o bloco de ajuste do Claude, no marco 5, já pede esse registro.

## Teste no iPhone

1. Em Mais → Ajustes → Sobre, confira "Carteira 0.4.0".
2. Em Ajustes, digite APAGAR, toque em **Apagar tudo** e depois em **Explorar com dados fictícios**.
3. **Início:** o cartão Alertas aparece entre a reserva e a alocação.
4. **Mais → Cenários:** em "Alocação-alvo da política", Crise global perde 18,38%, Crise local 12,02%, Juros e inflação em alta 11,7%, Aperto global 11,92% e Inverno cripto 2,4%. As outras visões mostram reais e percentuais.
5. **Mais → Política:**
   - o cartão do termômetro mostra as leituras e quanto cada alvo sobe;
   - informe 3.000,00 em "Aporte mensal previsto" e salve;
   - abra "Choques de Crise global" e confira que os campos aceitam números negativos.
6. **Aporte:** o cartão "Classes fora da faixa" diz em quantos meses os aportes corrigem cada classe. Digite um valor, salve o plano e use "Anotar no diário".
7. **Carteira → ETF do Ibovespa:** a tese aparece. Toque em **Quero vender**, escreva o motivo e anote. Depois toque em **Desistir da venda**.
8. **Revisão:** o checklist do mês, o diário com as anotações dos passos 6 e 7 e a tese. Toque em **Concluir a revisão do mês**.
9. **Offline:** com o modo avião, as telas novas abrem com os mesmos valores.
10. Conte o resultado de cada passo. Se ainda não fez o roteiro do marco 3, ele está no fim de `docs/marco-3.md`.
