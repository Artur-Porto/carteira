# Marco 3: política e aporte

Construído em 25/10/2026. Aceite do SPEC: os casos de referência do motor passam. O teste no iPhone está no fim deste arquivo.

## O que foi entregue

- **Tela Política**, em Mais → Política:
  - reserva: meta em meses, custo de vida mensal e piso de rendimento em % do CDI;
  - alvos das oito classes, cada um com a faixa 5/25 e a fatia de hoje ao lado, e a soma por prazo;
  - limites: teto de cripto, limite por emissor em % da garantia do FGC e limite por FII. A ação individual fica em 2,86%, sem edição até o marco 7;
  - tolerância a perdas, com o pior cenário dos alvos refeito enquanto os campos mudam;
  - parâmetros fiscais, com a data e a fonte de cada conferência;
  - o app recusa alvos que não somam 100%, alvo de cripto acima do teto, meses que não são inteiros e percentuais com mais de duas casas.
- **Início:** a alocação da carteira livre contra o alvo, classe a classe. Cada linha traz a fatia de hoje, o alvo e a faixa, por escrito e em barra. Uma classe fora da faixa ganha o aviso em texto.
- **Aporte do mês:**
  - o valor do aporte vira a parte da reserva e as parcelas das classes, cada uma com motivo, números, regra e tipo de ativo;
  - a checagem roda sobre a carteira depois do aporte: teto de cripto, pior cenário da carteira livre contra a tolerância, classes que seguem fora da faixa e emissores no limite do FGC;
  - **Salvar plano** guarda o plano, e **Marcar como executado** o fecha. Os planos ficam na mesma tela, como histórico.
- **Motor** em `src/engine/`, sem tela, rede nem armazenamento, como pede o SPEC:
  - `allocation.ts`: alocação contra o alvo;
  - `contribution.ts`: parte da reserva e divisão entre as classes;
  - `hints.ts`: tipo de ativo dentro da classe;
  - `scenarios.ts`: perda em cada cenário;
  - `plan.ts`: o aporte inteiro, com a checagem.
- **Parâmetro novo:** a garantia do FGC, em `src/domain/tax.ts`, conferida no regulamento do FGC.
- **Versão 0.3.0.**

## Decisões

1. **Reserva pelo valor líquido.** A cobertura usa o valor depois do IR estimado, como os meses de reserva do Início.
2. **Faixas atravessadas em etapas.**
   - Um aporte que passa da metade ou da meta segue cada percentual na sua faixa: 100% até a metade, 50% até a meta e nada depois.
   - Assim a reserva nunca passa da meta. Pela leitura literal do SPEC, uma reserva logo abaixo da metade levaria 100% de um aporte grande, mesmo que passasse da meta.
   - O centavo ímpar dos 50% vai para a reserva.
3. **Sem custo de vida, sem sugestão.** Se a meta pede meses e o custo de vida não foi informado, a tela pede o custo antes de sugerir, em vez de tratar a reserva como cheia.
4. **Maior déficit primeiro, por nivelamento.**
   - O déficit é o alvo aplicado à carteira livre depois do aporte, menos o valor de hoje, em reais.
   - O dinheiro vai para a classe de maior déficit até ela empatar com a segunda; daí as duas recebem juntas, e assim por diante, até três classes. Essa forma reduz o maior déficit o máximo possível.
   - Se os déficits das três classes não absorvem o aporte, como na primeira compra de uma carteira vazia, as três passam do alvo pelo mesmo valor.
   - Empates seguem a ordem das classes na política.
5. **Contas exatas.**
   - O motor usa inteiros e frações exatas.
   - Os centavos saem pelo método dos maiores restos. Restos iguais seguem a ordem dos déficits.
   - Depois, cada parcela abaixo de R$ 100 se junta à classe de maior déficit.
6. **Valores brutos de hoje na alocação**, como no Início. Posições sem preço entram pelo valor aplicado.
7. **Cripto nunca passa do teto** na divisão do aporte.
8. **Pior cenário da carteira livre.** A checagem compara a perda da carteira livre com a tolerância, como a tabela de cenários do SPEC. A perda sobre o patrimônio total, com reserva e previdência, fica para a tela Cenários, no marco 4.
9. **Escada do médio prazo.**
   - Anos vagos são os de 2 a 5 anos à frente sem nenhum vencimento das três classes de médio prazo da carteira livre.
   - A reserva e as posições encerradas não contam.
   - O motor sugere o primeiro ano vago.
10. **Emissor.**
    - O app soma, por conglomerado, o saldo bruto de CDB, RDB, LCI e LCA de instituições com FGC, reserva incluída, porque a garantia é por pessoa.
    - O limite é de 80% de R$ 250 mil.
    - Enquanto o conglomerado não puder ser editado, cada banco conta como o seu próprio conglomerado.
11. **Ação individual e FII.** O tipo de ativo avisa quando uma ação já passa de 2,86% da carteira livre ou um FII passa de 25% da classe. A escolha do ativo continua sendo do dono.
12. **Termômetro fora do aporte até o marco 4.** Até lá, o aporte usa os alvos sem deslocamento.
13. **O plano guarda a divisão**, como no modelo de dados: data, valor, parcelas e situação. Os motivos são da hora do cálculo e não ficam no histórico.
14. **Faixas saem dos alvos.** Ao salvar a política, o app refaz as faixas pela regra 5/25; elas não se editam à parte.

## Parâmetro conferido

Conferido em 25/10/2026, antes do uso no app, no regulamento publicado pelo próprio FGC.

| Regra | Valor | Fonte oficial |
| --- | --- | --- |
| Garantia do FGC | R$ 250 mil por pessoa e por instituição ou conglomerado, somando as instituições do mesmo conglomerado; R$ 1 milhão a cada 4 anos. Cobre depósitos a prazo (CDB e RDB), LCI e LCA; títulos públicos, como o Tesouro Direto, ficam de fora | [Regulamento do FGC, anexo II da Resolução CMN 4.222/2013, art. 2º, versão de 03/06/2026](https://www.fgc.org.br/documents/d/asset-library-52554/regulamento-fgc_20260603) |

## Casos de referência

Os valores esperados vêm de uma implementação independente em Python, com frações exatas e métodos diferentes dos do app:

- a reserva é percorrida faixa a faixa;
- o nível das classes sai de todas as combinações de classes sem dinheiro, recebendo ou no teto.

O app bateu com todos, centavo a centavo. Estão em `tests/unit/engine.test.ts`. Todas as carteiras são fictícias. Salvo indicação, a política é a inicial, e a carteira livre tem R$ 100.000,00.

**Parte da reserva**, com meta de 12 meses de R$ 6.000,00, ou R$ 72.000,00:

| Caso | Reserva antes | Aporte | Para a reserva |
| --- | --- | --- | --- |
| R1, abaixo da metade | R$ 20.000,00 | R$ 5.000,00 | R$ 5.000,00 |
| R2, cruza a metade | R$ 34.000,00 | R$ 5.000,00 | R$ 3.500,00: R$ 2.000,00 a 100% e R$ 1.500,00 a 50% |
| R3, entre a metade e a meta | R$ 50.000,00 | R$ 3.000,00 | R$ 1.500,00 |
| R4, completa a meta | R$ 70.500,00 | R$ 5.000,00 | R$ 1.500,00 |
| R5, meta cheia | R$ 72.000,00 | R$ 5.000,00 | nada |
| R6, acima da meta | R$ 80.000,00 | R$ 5.000,00 | nada |
| R7, centavo ímpar | R$ 50.000,00 | R$ 1.000,01 | R$ 500,01 |
| R8, cruza as duas faixas | R$ 10.000,00 | R$ 100.000,00 | R$ 62.000,00: R$ 26.000,00 a 100% e R$ 36.000,00 a 50% |
| R9, sem meta | — | R$ 1.000,00 | nada |

**Divisão entre as classes:**

| Caso | O que testa | Aporte | Parcelas |
| --- | --- | --- | --- |
| C1 | O maior déficit sozinho e, depois, empatado com o segundo | R$ 3.000,00 | IPCA+ até 5 anos, R$ 1.970,00; IPCA+ acima de 5 anos, R$ 1.030,00 |
| C2 | Parcela abaixo de R$ 100 e restos iguais | R$ 900,00 | IPCA+ acima de 5 anos, R$ 693,33, com os R$ 86,66 de Ações Brasil; Exterior, R$ 206,67 |
| C3 | No máximo três classes: a quarta e a quinta com déficit ficam de fora | R$ 1.500,00 | Pós-fixada, R$ 600,00; IPCA+ acima de 5 anos, R$ 500,00; IPCA+ até 5 anos, R$ 400,00 |
| C4 | Carteira livre vazia | R$ 10.000,00 | Pós-fixada, R$ 3.666,67; IPCA+ acima de 5 anos, R$ 3.266,67; IPCA+ até 5 anos, R$ 3.066,66 |
| C5 | Teto de cripto, numa política com 50% em pós-fixada, 30% em ações e 5% em cripto | R$ 10.000,00 | Pós-fixada, R$ 5.750,00; Ações Brasil, R$ 3.750,00; Cripto, R$ 500,00. Pior cenário de 22,25%, acima da tolerância |
| C6 | Déficits empatados, numa carteira de R$ 50.000,00 | R$ 150,00 | Pós-fixada, R$ 150,00, com os R$ 75,00 de IPCA+ até 5 anos |
| C7 | Alvos com decimais | R$ 2.000,00 | IPCA+ acima de 5 anos, R$ 1.301,67, com os R$ 53,33 da pós-fixada; IPCA+ até 5 anos, R$ 698,33 |

**Plano completo (P1).** Reserva líquida de R$ 50.000,00, a carteira de C1 e aporte de R$ 5.000,00:

- R$ 2.500,00 para a reserva, que está entre a metade e a meta;
- IPCA+ até 5 anos, R$ 1.725,00, e IPCA+ acima de 5 anos, R$ 775,00;
- depois do aporte, só cripto fica fora da faixa, abaixo dela;
- pior cenário: crise global, com perda de 18,43%, dentro da tolerância de 20%. A classe que mais pesa é Ações Brasil.

## Testes

- **Unidade** (`npm test`), 113 casos, 30 deles novos:
  - casos de referência da reserva, das classes e do plano completo;
  - nivelamento com frações e teto;
  - faixas 5/25 nas bordas e classe fora da faixa;
  - perdas da alocação-alvo iguais às da tabela do SPEC;
  - escada, emissores com FGC, ação individual, FII e cripto no tipo de ativo;
  - validação da política;
  - toda regra fiscal com data e fonte oficial.
- **Ponta a ponta** (`npm run e2e`), no WebKit com tela de iPhone e no Chromium:
  - aporte montado pelas telas, com a divisão do Python, o modo discreto, o plano salvo e marcado como executado;
  - política com soma errada recusada, soma certa salva e o novo alvo no Início;
  - aporte sem custo de vida, que pede o custo;
  - a sessão completa sem requisição fora da própria origem passa a salvar um plano e a política.

## Ajustes propostos no SPEC.md

Dependem da aprovação do dono do app.

1. **Prioridade no aporte:** "A cobertura usa o valor líquido de IR. Um aporte que atravessa a metade ou a meta segue cada percentual na sua faixa, e a reserva nunca passa da meta."
2. **Aporte do mês, passo 3:** "O restante vai para as classes com maior déficit em reais frente ao alvo, já contando o aporte, pelos valores brutos de hoje: a de maior déficit recebe até empatar com a seguinte, e daí as duas juntas."
3. **Aporte do mês, passo 6:** "Antes de mostrar, o motor confere os limites e recalcula o pior cenário da carteira livre, comparado com a tolerância."
4. **Limites:** "Vencimentos do médio prazo: distribuídos em escada, um por ano, de 2 a 5 anos à frente."
5. **Carteira livre:** "As faixas saem dos alvos pela regra 5/25 e não se editam à parte."
6. **Parâmetros fiscais:** a linha do FGC passa a citar o regulamento do FGC, conferido em fonte oficial em 25/10/2026.

## Fica para depois

- **Conglomerado editável**, para somar bancos do mesmo grupo no limite do FGC. Proposta: marco 4, com os alertas de emissor.
- **Termômetro no aporte, choques editáveis e tela Cenários:** marco 4.
- **Decisão do aporte no diário:** marco 4, com a revisão mensal.
- **Ativos elegíveis da lista de observação no tipo de ativo:** marco 8.
- **Limite da ação individual pela fórmula do orçamento de risco:** marco 7.

## Teste no iPhone

1. Abra o app pelo ícone. Em Mais → Ajustes → Sobre, confira "Carteira 0.3.0". Se aparecer 0.2.0, feche o app pelo seletor de apps e abra de novo.
2. Em Ajustes, digite APAGAR, toque em **Apagar tudo** e depois em **Explorar com dados fictícios**.
3. **Início:** abaixo da reserva, o cartão "Alocação da carteira livre" mostra as oito classes, cada uma com a fatia de hoje, o alvo e a faixa. Uma classe fora da faixa diz isso por escrito.
4. **Aporte**, na barra de baixo: digite 3.000,00.
   - A reserva recebe R$ 1.500,00, porque cobre entre a metade e a meta.
   - O resto se divide em até três classes, cada uma com motivo, tipo de ativo e regra.
   - Se FIIs receber parte do aporte, o app avisa que os dois FIIs fictícios já passam de 25% da classe. As classes escolhidas dependem dos preços do dia.
   - Na checagem, aparecem o teto de cripto, o pior cenário e as classes fora da faixa.
5. Toque no olho do topo: os valores somem e os percentuais ficam. Toque de novo.
6. Toque em **Salvar plano**. O botão vira "Plano salvo", e o plano aparece em Planos como planejado. Toque em **Marcar como executado**.
7. **Mais → Política:**
   - mude FIIs para 9 e toque em **Salvar política**: o app recusa, porque a soma dá 101%;
   - mude Exterior para 12 e salve de novo: deve aparecer "Política salva.";
   - no Início, FIIs passa a mostrar alvo de 9%, com faixa de 6,75% a 11,25%.
8. Volte à Política, toque em **Usar os valores iniciais** e salve.
9. Ainda na Política, no fim da tela, confira os parâmetros fiscais, com o FGC conferido em 25/10/2026.
10. **Offline:** ative o modo avião, feche o app, abra de novo e faça um aporte. A conta deve sair igual. Depois, desative o modo avião.
11. Conte o resultado de cada passo e qualquer coisa estranha nas telas.
