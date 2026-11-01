# Contrato de continuidade do Burger Rush

Referência inspecionada em 29/10/2026: `a4e22c3`, após a correção de canvas `e1bee19`. O usuário informou que corrigiu o jogo no Claude e pediu que suas escolhas fossem preservadas nas próximas atualizações. Estes valores descrevem essa implementação; não são um bloqueio a melhorias explicitamente pedidas. Revalidar as âncoras quando o código mudar.

## Identidade e interface

- Jogo de gerenciamento para uso diário, com cena 3D isométrica e materiais cartoon; não um anúncio jogável nem um dashboard corporativo.
- Fredoka local 500/700, texto escuro `#2b2140`, cartões creme `#fff8ec`, ações verdes `#2fbf4a` com sombra/borda `#1c8a31`. Reusar cores dos componentes para outros estados.
- Painéis arredondados, linhas com ícone, título/descrição e botão de ação, hierarquia curta e legível. Reutilizar `.card`, `.up`, `.btn`, `.btn.big` e os componentes do painel afetado.
- HUD mantém dinheiro e progresso visíveis, configurações/som acessíveis e ações de jogo agrupadas. Não mover tudo ao acrescentar uma funcionalidade.
- Melhorias devem mostrar efeito antes → depois, preço, limite/fase e estimativa de retorno quando disponível. A estimativa deve ser apresentada como estimativa, sem inventar rendimento garantido.
- Bolsa: preservar os totais investidos por ativo e da carteira, além das quantidades e controles de compra/venda. Não remover informação já solicitada para simplificar o layout.
- Mobile primeiro; safe area e altura do banner entram no posicionamento. Observar as regras de `min-width:700px`, paisagem com altura até 620px e telas até 380px antes de criar outro breakpoint.

Âncoras em `www/index.html`: `@font-face`, `:root`, `.card`, `.up`, `.side`, `@media`, `renderUps`, `MeshToonMaterial`. Sombreamento atual tem três faixas. Novos itens devem seguir escala, iluminação e materiais da cena existente.

## Câmera, canvas e personagem

| Contrato observado | Implementação de referência |
| --- | --- |
| Projeção isométrica ortográfica | `OrthographicCamera`, near 0.1, far 200; `CAM_OFF = (10,13,10)` |
| Dimensões lógicas | `visualViewport.width/height`, fallback `innerWidth/innerHeight`, nunca zero |
| Enquadramento | `halfH = max(5.2, min(8, 5.2/max(.65, aspecto)))`; limites horizontais derivados do aspecto |
| Acompanhamento | Alvo inicial `(2,0,-2)`; segue `(player.x,0,player.z)` com `1-exp(-dt*6)`, soma `CAM_OFF`, aplica `lookAt` |
| Resolução | Modo econômico: DPR 1. Demais modos: teto 1.5 para área CSS acima de 1.600.000; teto 2 nas outras telas |
| Canvas ocupa a viewport | CSS fixo com `inset:0`, largura/altura 100%; `setSize(w,h,true)` atualiza também dimensões CSS; depois atualiza projeção |

**Regressão a evitar:** `setSize(w,h,false)` sem dimensionamento CSS adequado deixou o tamanho intrínseco do canvas crescer com o DPR. Parte da cena foi cortada, parecendo sumiço do personagem/defeito de câmera. Não corrigir isso mudando zoom ou teleportando o personagem sem medir o canvas.

São invariantes de comportamento, não testes que exigem uma string exata. Se no futuro houver outra implementação correta, verificar os mesmos resultados. O CSS atual usa `canvas` globalmente; ao mexer nele, verificar também canvases da bolsa. Não impor o estilo do canvas WebGL a gráficos novos por acidente.

Âncoras: `renderer.setPixelRatio`, `function resize`, `renderer.setSize`, `CAM_OFF`, `camTarget`, `cam.lookAt`.

## Entrada e movimento

- WASD e setas; digitar em campos não move personagem.
- Arraste não começa sobre botão ou modal. Joystick tem raio de 50px; `pointerup` e `pointercancel` limpam a entrada.
- Normalizar diagonais; tela → chão: `vx=(ix+iy)*Math.SQRT1_2`, `vz=(-ix+iy)*Math.SQRT1_2`.
- Critério para próximas validações: movimento e acompanhamento coerentes em retrato/paisagem; modais e perda de foco não deixam o jogador andando sozinho. A perda de foco ainda não foi comprovada nesta inspeção.
- `?auto=1` demonstra o jogo, mas não comprova colisões nem toque manual: o bot tem tratamento especial. Não usá-lo como único teste de controles.

## Save e evolução

- Chave local observada: `burger-rush-save-v1`. Schema atual: **7**, com migrações desde 1. Incrementar versão para novo formato e preservar migrações; não tratar o número deste documento como versão eterna.
- Persistência periódica de alterações a cada 2s e em `pagehide`. `FRESH` bloqueia o save de progresso; isso não é garantia de isolamento de todo storage/auth.
- Visitante continua jogável; login é opcional para manter a mesma conta entre dispositivos. Não misturar silenciosamente progresso de identidades diferentes.
- Validar migrações com fixtures antigas isoladas e dados sentinela; confirmar que dinheiro, estabelecimentos, funcionários e carteira sobrevivem.
- Sincronização Firebase deve ser testada separadamente de Play Games legado. A documentação antiga do README não prova a integração atual.

Âncoras: `SAVE_VERSION`, `MIGRATIONS`, `migrate`, `persist`, `lockSave`, `Cloud`; funcionários em `www/staff.js` e testes em `tests/staff.test.mjs`.

## Verificação antes de declarar correção

Escolher pelo impacto; não repetir a matriz inteira para uma troca de texto.

| Mudança | Evidência necessária |
| --- | --- |
| Câmera, canvas ou resize | 390×844 DPR 2/3, 844×390 DPR 3, 768×1024 DPR 2 e 1366×768 DPR 1; registrar tamanho CSS/buffer e DPR efetivo, redimensionar na mesma sessão e conferir modo econômico |
| Personagem/movimento | Personagem visível e dentro da viewport após movimento manual e acompanhamento; testar perto dos limites; screenshot + posição/projeção em harness quando disponível |
| UI mobile | Painel abre/fecha, conteúdo e ações alcançáveis, sem corte horizontal, sem botão encoberto por banner/safe area, sem gráfico ocupando tela inteira |
| Save/migração | Fixture antiga → versão atual, persistir/recarregar, preservar campos; para nuvem, dois contextos autenticados da mesma conta e conflito real, quando autorizado |
| Funcionários/economia | Testes de regras relevantes + fluxo integrado na interface; conferir efeito mensurável e retorno apresentado |

Para canvas, medir `getBoundingClientRect()` contra viewport CSS (tolerância de arredondamento), comparar o drawing buffer com CSS × DPR efetivo. DPR emulado deve constar da evidência; viewport estreita sozinha não simula DPR 3. A posição projetada precisa estar dentro do quadro e o mesh precisa estar visível: um cálculo geométrico sozinho não detecta oclusão.

`tests/camera-regression.mjs` contém verificações textuais; não é teste de renderização. `tests/staff.test.mjs` executa lógica em VM; não comprova integração visual. Build APK/AAB não comprova funcionamento em aparelho. Não transformar esses resultados em aprovação mais ampla.

## Referências visuais desta inspeção

Capturas reais da execução local de `a4e22c3` em `?auto=1`, viewport observada no navegador de 668×620. São referências observadas, **não uma nova aprovação estética do usuário nem teste em celular**. O tempo do bot altera objetos, dinheiro e clientes; comparar hierarquia, cores, escala e enquadramento, não exigir pixels idênticos desses elementos dinâmicos.

- [Cenário e personagem](referencias-visuais/2026-10-29-jogo.jpg)
- [Painel de melhorias](referencias-visuais/2026-10-29-melhorias.jpg)

Nesta tarefa foi feita observação visual local, não regressão completa em DPR 2/3, aparelho físico, save ou login. Atualizações futuras devem produzir evidências próprias para as áreas alteradas.
