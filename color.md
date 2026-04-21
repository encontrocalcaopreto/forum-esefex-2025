# Handoff: Sistema de Cores por Eixo Temático

## Overview

Este handoff documenta a implementação de um **sistema de cores distinto para cada eixo temático** do XIII Fórum Científico da EsEFEx. Anteriormente, todos os eixos usavam a mesma paleta de laranja. Agora, cada um tem uma cor de acento própria, melhorando a hierarquia visual e a identificação de seções.

## Sobre os Arquivos de Design

Os arquivos neste pacote são **protótipos em HTML** criados durante a exploração de design. Não são código de produção pronto para copiar. Sua tarefa é **implementar este sistema de cores na base de código existente** (ou criar uma nova) usando as tecnologias e padrões já estabelecidos no projeto.

## Fidelidade

**High-fidelity (hifi)**: Os valores de cor, tipografia, espaçamento e efeitos hover são pixel-perfeitos e devem ser recriados com precisão usando a stack do projeto.

## Sistema de Cores — 5 Eixos

| Eixo | Nome | Cor Principal (HEX) | Uso |
|------|------|-------------------|-----|
| 1 | Fisiologia do Desempenho em Ambientes Extremos | `#ff6b1a` (laranja) | Cards, badges, borders |
| 2 | Militar e Operacional | `#4caf72` (verde exército) | Cards, badges, borders, dots timeline |
| 3 | Esporte de Alto Rendimento em Condições Extremas | `#3fb8a0` (verde-água) | Cards, badges, borders, dots timeline |
| 4 | Treinamento de Força para Alta Performance | `#9b6dd6` (violeta) | Cards, badges, borders, dots timeline |
| 5 | Futebol: Desempenho em Ano de Copa | `#5b8db8` (azul) | Cards, badges, borders, dots timeline |

## Paleta Completa por Eixo

Para cada eixo, há **3 variações**:

- **Cor Principal**: usada em títulos, ícones, borders
- **Dim** (13% opacity): fundo suave para cards e badges
- **Border** (28% opacity): borda hover, glow effects

### Eixo 1 (Fisiologia)
```css
--eixo-1:        #ff6b1a;
--eixo-1-dim:    rgba(255,107,26, .13);
--eixo-1-border: rgba(255,107,26, .28);
```

### Eixo 2 (Militar)
```css
--eixo-2:        #4caf72;
--eixo-2-dim:    rgba(76,175,114, .13);
--eixo-2-border: rgba(76,175,114, .28);
```

### Eixo 3 (Alto Rendimento)
```css
--eixo-3:        #3fb8a0;
--eixo-3-dim:    rgba(63,184,160, .13);
--eixo-3-border: rgba(63,184,160, .28);
```

### Eixo 4 (Força)
```css
--eixo-4:        #9b6dd6;
--eixo-4-dim:    rgba(155,109,214, .13);
--eixo-4-border: rgba(155,109,214, .28);
```

### Eixo 5 (Futebol)
```css
--eixo-5:        #5b8db8;
--eixo-5-dim:    rgba(91,141,184, .13);
--eixo-5-border: rgba(91,141,184, .28);
```

## Elementos Afetados

### 1. Cards de Eixo (`.eixo-card`)
- **Border top**: gradient de cor principal → cor clara
- **Ícone**: fundo dim com cor principal
- **Hover**: glow shadow na cor do eixo

**CSS**:
```css
.eixo-card[data-eixo="1"]::before { 
  background: linear-gradient(90deg, #ff6b1a, #ff8c42); 
}
.eixo-card[data-eixo="1"] .eixo-card__icon { 
  background: rgba(255,107,26, .13); 
  border-color: rgba(255,107,26, .28); 
}
.eixo-card[data-eixo="1"] .eixo-card__icon svg { 
  color: #ff6b1a; 
}
.eixo-card[data-eixo="1"]:hover { 
  box-shadow: 0 8px 32px rgba(255,107,26, .13);
  border-color: rgba(255,107,26, .28);
}
```

Repetir para `[data-eixo="2"]` até `[data-eixo="5"]` com cores respectivas.

### 2. Badges de Eixo (`.eixo-badge--N`)
- **Fundo**: cor dim
- **Cor do texto**: cor principal
- **Border**: cor border

**CSS**:
```css
.eixo-badge--1 { 
  background: rgba(255,107,26, .13); 
  color: #ff6b1a; 
  border: 1px solid rgba(255,107,26, .28); 
}
```

Repetir para `--2` até `--5`.

### 3. Timeline Dots (`.eixo-dot--N`)
- **Fundo**: cor principal
- **Glow**: box-shadow com 50% opacity

**CSS**:
```css
.eixo-dot--1 { 
  background: #ff6b1a; 
  box-shadow: 0 0 10px rgba(255,107,26, .5); 
}
```

### 4. Speaker Cards por Eixo
- **Borda inferior**: 2px solid na cor border do eixo
- **Label de instituição**: cor principal
- **Hover**: border-color vira cor border, glow na cor dim

**CSS**:
```css
.speakers-grid[data-eixo="1"] .speaker-card { 
  border-bottom: 2px solid rgba(255,107,26, .28); 
}
.speakers-grid[data-eixo="1"] .speaker-card__inst { 
  color: #ff6b1a; 
}
.speakers-grid[data-eixo="1"] .speaker-card:hover { 
  border-color: rgba(255,107,26, .28);
  box-shadow: 0 8px 32px rgba(255,107,26, .13);
}
```

### 5. Labels de Seção de Palestrantes
- **Borda inferior**: cor border do eixo

**CSS**:
```css
.speakers-eixo-label[data-eixo="1"] { 
  border-bottom-color: rgba(255,107,26, .28); 
}
```

## Tipografia

- **Labels, tags, badges**: Inter 600, 0.70–0.72rem
- **Títulos h1/h2**: Rajdhani 700, 60px (hero)
- **Subtítulos**: Inter 400, tamanho natural

## Implementação

### HTML

Adicionar atributo `data-eixo="N"` em elementos que precisam de cor:

```html
<!-- Cards de eixo -->
<div class="eixo-card" data-eixo="1">
  <div class="eixo-card__icon">
    <svg><!-- ícone --></svg>
  </div>
  <!-- conteúdo -->
</div>

<!-- Seção de palestrantes -->
<div class="speakers-eixo-label" data-eixo="1">
  <h3>Eixo 1: Fisiologia...</h3>
</div>
<div class="speakers-grid" data-eixo="1">
  <!-- cards de speaker -->
</div>
```

### CSS

Usar CSS custom properties para evitar repetição:

```css
:root {
  --eixo-1: #ff6b1a;
  --eixo-1-dim: rgba(255,107,26, .13);
  --eixo-1-border: rgba(255,107,26, .28);
  /* ... etc para eixos 2-5 */
}

/* Aplicar dinamicamente */
.eixo-card[data-eixo="1"]::before { 
  background: linear-gradient(90deg, var(--eixo-1), #ff8c42); 
}
.eixo-card[data-eixo="2"]::before { 
  background: linear-gradient(90deg, var(--eixo-2), #6dc98a); 
}
/* etc */
```

## Estados Interativos

### Hover em Cards
- **Transição**: 200ms ease
- **Propriedades**: border-color, box-shadow, transform (opcional: translateY -4px)

```css
.eixo-card:hover {
  border-color: var(--eixo-border);
  box-shadow: 0 8px 32px var(--eixo-glow);
  transition: all 200ms ease;
}
```

### Hover em Speaker Cards
- **Mesmas propriedades** da cor do eixo

## Responsive

Todas as cores e tamanhos são definidos em variáveis CSS — escalam automaticamente com media queries existentes. Nenhuma mudança adicional necessária.

## Assets Utilizados

- Fonte: **Rajdhani** (títulos) + **Inter** (corpo)
- Cores: Custom palette por eixo (veja tabela acima)
- Ícones: SVG inline (sem dependência de biblioteca)

## Arquivos de Referência

- `index-v2.html` — Protótipo completo com todas as cores e interações
- `css/style-v2.css` — CSS compilado com todas as regras por eixo

## Próximos Passos

1. Integrar CSS custom properties ao sistema de design da base de código
2. Atualizar HTML para incluir `data-eixo="N"` em componentes relevantes
3. Testar hover states em todos os elementos
4. Validar acessibilidade: contrast ratio deve estar ≥ 4.5:1 em todos os textos

## Contato para Dúvidas

Qualquer dúvida sobre implementação ou ajustes nas cores, consultar o protótipo `index-v2.html` para referência visual precisa.
