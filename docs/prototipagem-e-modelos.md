# Prototipagem com menos retrabalho

Recomendação em 29/10/2026. Não é um benchmark do Burger Rush nem uma alteração do modelo selecionado no aplicativo.

## Modelo principal

Para continuar no Claude, começar com **Sonnet 5.5**. No Codex, começar com **GPT-6.1 Sol**. São opções equilibradas para implementar uma funcionalidade com contexto do projeto. Não há medição local que permita afirmar qual deles entrega mais alterações corretas por dólar neste jogo.

| Trabalho | Escolha inicial | Quando escalar |
| --- | --- | --- |
| Funcionalidade de jogo, UI com lógica, implementação completa | Sonnet 5.5 ou GPT-6.1 Sol | Defeito reproduzido continua sem causa após duas tentativas fundamentadas |
| Ajuste visual pequeno, com componentes e referência definidos | GPT-6.1 Terra, se disponível, ou o modelo principal já em uso | O ajuste afeta câmera, renderização, controles ou persistência |
| Extração de campos, texto, inventário delimitado | Haiku 5.5 ou GPT-6 Luna | Precisa decidir arquitetura ou comportamento |
| Diagnóstico difícil, concorrência do save, migração arriscada | Opus 5.5; Astra como alternativa disponível no Codex | Usar em um problema delimitado; retornar ao modelo principal depois |

Usar esforço médio em mudanças delimitadas quando a ferramenta oferecer esse controle; aumentar para alto em problemas complexos. Esta é uma recomendação de trabalho, não uma mudança automática de modelo. A skill não consegue obrigar o aplicativo a trocar o modelo.

## Preço de referência

API, USD por 1 milhão de tokens, processamento padrão, sem ferramentas adicionais, impostos ou gravação de cache. Não são preços da assinatura nem medição desta sessão.

| Modelo | Entrada sem cache | Leitura de cache | Saída |
| --- | ---: | ---: | ---: |
| Claude Sonnet 5.5 | $2,00 | $0,10 | $10,00 |
| GPT-6.1 Sol | $2,00 | $0,10 | $10,00 |
| GPT-6.1 Terra | $1,00 | $0,05 | $5,00 |
| Claude Opus 5.5 | $4,00 | $0,20 | $20,00 |
| GPT-6 Astra | $10,00 | $1,00 | $50,00 |
| Claude Haiku 5.5, prompt até 100 mil tokens | $0,10 | $0,01 | $0,50 |
| GPT-6 Luna | $0,10 | $0,01 | $0,50 |

Exemplo aritmético: 100 mil tokens de entrada sem cache + 10 mil de saída custam $0,30 no Sonnet/Sol, $0,15 no Terra e $0,60 no Opus. Isso não estima uma funcionalidade inteira: ferramentas, raciocínio faturável, repetição de contexto e novas tentativas mudam o total. Acima de 100 mil tokens de prompt, o Haiku 5.5 tem outra faixa de preço.

Fontes oficiais consultadas: [preços OpenAI](https://developers.openai.com/api/docs/pricing), [catálogo OpenAI](https://developers.openai.com/api/docs/models), [preços Claude](https://platform.claude.com/docs/en/about-claude/pricing), [Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview). Reconsultar antes de uma futura decisão de compra. Não converter essa tabela diretamente em limite de plano Pro/Max/ChatGPT/Codex.

## Rotina de economia

1. Uma entrega por vez, com critério observável. Exemplo: “adicionar ordem de venda, mantendo o painel e a câmera atuais”.
2. Começar pelo estado do Git, pelo contrato de padrões e pelas âncoras do módulo afetado. Ler trechos; não recarregar o HTML completo, vendors, histórico de chat, SDK ou evidências antigas sem necessidade.
3. Preservar componentes, dependências e código fora do escopo. Uma tela nova deve usar os componentes existentes. Não reescrever o jogo para acrescentar um botão.
4. Fazer uma tarefa curta diretamente. Para varredura ampla, um agente por frente, com pergunta, limite de leitura e conclusão compacta; não mandar o histórico inteiro nem duplicar a pesquisa. Respeitar os limites de agentes das instruções vigentes.
5. Validar o comportamento afetado uma vez; ampliar a regressão quando houver risco real, falha ou mudança adicional. Erro visual precisa de navegador e screenshot; teste textual não o substitui.
6. Se a sessão ficar grande, salvar um handoff curto: objetivo, commit, arquivos alterados, decisões, comando/teste executado e pendência. Iniciar outra conversa para uma funcionalidade independente, sem copiar todo o chat anterior.
7. Escalar o raciocínio ou o modelo diante de uma incerteza concreta. Não manter o mais caro em tarefas mecânicas nem repetir tentativas às cegas no mais barato.

Não alterar cache, compactação, plugins ou configuração global só por uma promessa de economia. Em 29/10 foram observados `model=opusplan` e `autoCompactWindow=300000` no Claude; o arquivo de regras de performance ainda citava 150000. No arquivo do Codex havia `model=gpt-5.6-sol` e esforço `medium`. Esses arquivos não provam o modelo efetivo de uma conversa, e não foram alterados nesta tarefa.

## Medir sem inventar economia

Comparar três mudanças representativas: ajuste de um painel, funcionalidade pequena e correção de regressão reproduzível. Para cada execução, registrar modelo efetivo, esforço, tokens de entrada/cache/saída quando disponíveis, custo informado pelo provedor, tempo, correções do usuário e testes aprovados. Usar o mesmo commit e critérios de aceite; não avaliar somente pelo volume de código produzido.

Métrica principal: **custo por mudança aceita e validada**, incluindo retrabalho. Sem telemetria comparável, informar apenas a recomendação; não afirmar percentuais de economia.

## Pedido reutilizável

> Use a skill burger-rush-evolucao e o contrato de padrões do projeto. Implemente [mudança]. Preserve o visual, a câmera, os controles e o save atuais fora do escopo. Leia somente os trechos necessários. Faça a menor mudança coerente e valide [critério observável]. Entregue o diff e a evidência, sem publicar se isso não tiver sido autorizado.
