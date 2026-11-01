---
name: burger-rush-evolucao
description: Evoluir, prototipar ou corrigir o Burger Rush preservando o visual, câmera isométrica, controles mobile e saves que o usuário corrigiu no Claude. Use para novas funcionalidades, regressões e mudanças de UI neste jogo, ou ao pedir seus padrões de prototipagem e economia de tokens. Não aplicar a identidade visual do jogo a outros sistemas.
---

# Burger Rush: evolução com continuidade

## Localizar a referência

1. Confirmar o repositório Burger Rush por `package.json`, `www/index.html` e, quando disponível, remote `eliseurizzonato/burger-rush`. Não assumir um caminho absoluto nem ler segredos Android.
2. Ler `AGENTS.md`, estado do Git e histórico recente. Mudanças feitas pelo usuário depois da referência têm precedência. Não restaurar silenciosamente uma versão antiga.
3. Ler só a seção afetada de `docs/padroes-burger-rush.md`. Se este arquivo estiver ausente, consultar [a referência resumida](references/base-observada.md) e confirmar as âncoras no código atual; não inventar parâmetros com base no chat antigo.

## Delimitar e implementar

- Traduzir o pedido em comportamento observável e listar mentalmente os invariantes afetados: visual, câmera/entrada, progressão/save ou publicação. Aumentar escopo só quando necessário para resolver o pedido.
- Reutilizar `.card`, `.up`, `.btn`, HUD e tokens existentes. Não confundir “melhorar” com redesenhar toda a interface. Padrões de um painel financeiro genérico não substituem a linguagem do jogo.
- Para câmera/canvas, usar os parâmetros do código atual e distinguir CSS, buffer e DPR. Para controles, preservar a transformação isométrica e liberação do joystick. Para save, manter migrações e visitante.
- Fazer patches focados. Evitar refatoração completa do HTML, troca de Three.js/Capacitor ou build Android quando a tarefa só precisa de uma mudança web.
- Se não houver causa após duas tentativas fundamentadas, parar o ciclo de patches: reproduzir, reduzir o caso e pedir análise mais profunda. Não reiniciar pesquisas já respondidas.

## Evidência proporcional

- Usar a matriz de verificação da seção afetada do contrato. Para UI/câmera: navegador real, dimensões/DPR registrados e screenshot inspecionado. Regex, build e bot automático não comprovam renderização e controle manual.
- Preservar saves reais. Usar origem/perfil de teste e `fresh` quando adequado; confirmar os efeitos do modo antes de usar. Testes de login precisam distinguir mock de conta real.
- Executar testes existentes relevantes, ampliar só diante de falha, risco ou nova mudança. Relatar exatamente o que foi executado e o que falta.
- Resposta final: mudança concreta, evidência, limitação material e estado da publicação. Screenshot observado não vira aprovação estética do usuário.

## Economizar contexto

- Começar por `rg -n` e ler trechos do módulo. Não carregar vendors, dumps de DOM, todos os testes ou todo o histórico sem necessidade.
- Tarefa curta: executar diretamente. Varredura ampla independente: delegar uma pergunta delimitada, sem copiar todo o histórico nem duplicar a busca; respeitar o teto das instruções atuais.
- Manter handoff curto com commit, decisões e pendências. Consultar `docs/prototipagem-e-modelos.md` somente para escolha de modelo, avaliação de custo ou organização de uma nova frente.
- A skill não troca modelos nem configura cache/compactação. Não prometer redução percentual sem medir custo por alteração aceita.

## Portabilidade e limites

Os padrões específicos vivem no repositório. Uma cópia pessoal desta skill serve como ponto de entrada e deve localizar o projeto antes de agir. Para outro sistema, reutilizar o método de leitura curta e verificação, mas extrair sua própria identidade visual. Não herdar a paleta, câmera ou decisões econômicas do Burger Rush.

Autorização para implementar não concede autorização permanente para push, upload, termos ou publicação. Aplicar a autorização vigente, sem perguntar de novo quando a ação já estiver claramente aprovada.
