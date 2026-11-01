# Referência resumida — 29/10/2026

Snapshot para localizar os padrões se a documentação do repo estiver ausente. Fonte: `eliseurizzonato/burger-rush`, `a4e22c3`, correção de canvas `e1bee19`. O usuário disse ter corrigido a versão no Claude e pediu preservar suas escolhas. Confirmar no código atual antes de aplicar; commits posteriores prevalecem.

- Visual: Three.js r128 cartoon, perspectiva visual isométrica com câmera ortográfica; Fredoka 500/700 local; texto `#2b2140`, cartões creme `#fff8ec`, ação verde `#2fbf4a`/borda `#1c8a31`. Reusar `.card`, `.up`, `.btn`; mobile primeiro. Preservar informação de efeito antes/depois nas melhorias e investimento por ativo/total na bolsa.
- Câmera: `CAM_OFF=(10,13,10)`, near/far 0.1/200, alvo acompanha jogador com `1-exp(-dt*6)`. `halfH=max(5.2,min(8,5.2/max(.65,aspecto)))`.
- Canvas: CSS deve ocupar viewport, sem multiplicar largura CSS pelo DPR. `setSize(w,h,true)` + CSS explícito corrigiram o corte em telas de alta densidade. DPR econômico 1; demais: máximo 1.5 se área CSS >1.600.000, senão 2. Verificar outros canvases antes de mudar CSS global.
- Controles: WASD/setas, joystick 50px, diagonais normalizadas; `vx=(ix+iy)*sqrt(1/2)`, `vz=(-ix+iy)*sqrt(1/2)`. Ignorar campos/botões/modais e limpar movimento em cancelamento.
- Save: chave `burger-rush-save-v1`, schema 7 naquele commit; preservar migrações. Visitante disponível e login opcional. Não usar/resetar save real como teste.
- Falha de método anterior: regex de câmera passou sem comprovar renderização. Testar CSS/buffer/DPR, personagem visível, movimento e resize em navegador. Bot `auto` não prova colisões/toque manual; build não prova app no aparelho.
- Não aplicar a paleta ou câmera deste jogo a outro sistema. Não publicar nem alterar configurações globais com base nesta referência.

Esta referência foi extraída do código e de duas observações locais. Não houve nesta tarefa certificação em celular físico, DPR 2/3, login ou sincronização. O contrato completo fica em `docs/padroes-burger-rush.md` no repo.
