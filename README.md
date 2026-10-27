# Burger Rush

Jogo casual de lanchonete em 3D (Three.js), feito para jogar um pouco todo dia no celular ou no navegador.

## Como jogar

Arraste na tela (ou use WASD / setas) para mover o chef:

1. Pegue os lanches na chapa, na fritadeira e na máquina de refri.
2. Entregue no balcão; cada produto tem sua seção.
3. Recolha o dinheiro e pise nas áreas tracejadas para comprar mesas, máquinas e ajudantes.

## Conteúdo

- **Lanches:** hambúrguer, batata frita e refri, com pedidos combinados.
- **3 restaurantes:** Lanchonete da Praça, Quiosque da Praia e Praça de Alimentação. Cada um tem tema, preços e melhorias próprios. Os que você não está jogando rendem dinheiro passivo.
- **Missões diárias:** 3 por dia, renovadas à meia-noite.
- **Bônus de dias seguidos:** até 7 dias.
- **Ganhos offline:** até 60 minutos.
- **Progresso salvo** no navegador.

## Rodar localmente

```bash
python3 -m http.server 8766
```

Abra http://localhost:8766. Use `?auto=1` para um robô jogar sozinho (modo de teste, não salva) e `?fresh=1` para começar sem save.

## Prints

![Lanchonete completa](prints/v3-01-lanchonete-completa.jpg)
![Missões](prints/v3-02-missoes.jpg)
![Quiosque da Praia](prints/v3-05-quiosque-praia.jpg)
