# Burger Rush — regras do projeto

- Responder em pt-BR. Preservar correções feitas pelo usuário/Claude; começar com `git status` e histórico recente.
- A referência é o jogo atual, não os protótipos antigos deste chat. Antes de mudar visual, câmera, entrada ou save, ler a seção correspondente de [docs/padroes-burger-rush.md](docs/padroes-burger-rush.md).
- Para evoluir ou corrigir o jogo, usar [.agents/skills/burger-rush-evolucao/SKILL.md](.agents/skills/burger-rush-evolucao/SKILL.md). O fluxo é compartilhado com Claude pelo `CLAUDE.md`.
- Manter a linguagem visual existente e reaproveitar componentes. Não redesenhar HUD, câmera ou controles como efeito colateral de outra funcionalidade.
- Câmera: distinguir tamanho CSS, buffer WebGL e DPR. Um teste de regex não valida personagem visível nem enquadramento.
- Save: preservar migrações, progresso e modo visitante. Testar com massa isolada; nunca usar/resetar a conta real como fixture.
- Ler por âncoras e trechos, sem despejar o HTML monolítico, vendors ou histórico completo. Consultar [docs/prototipagem-e-modelos.md](docs/prototipagem-e-modelos.md) apenas para escolhas de modelo/custo ou handoff.
- Uma correção precisa de evidência compatível com a afirmação. Diferenciar teste de lógica, navegador, aparelho físico e produção; não chamar simulação de integração real.
- Publicar site, enviar build e liberar Google Play são ações distintas. Executar só as autorizadas na conversa vigente; perguntar antes de aceitar novos termos ou enviar algo não autorizado.
