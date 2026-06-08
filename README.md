# Sistema de Avaliação de Desempenho de APLs

Sistema web baseado no **Capítulo 3 — Modelo de Avaliação de Desempenho de Arranjos Produtivos Locais** (Cardoso & Mendonça), do livro *Sustentabilidade e Responsabilidade Social*, Vol. 1.

## Funcionalidades

- **Dashboard** — KPIs, radar por dimensão, ranking, mapa de gargalos, **casos conhecidos IBGE**, gráficos por tópico setorial
- **Avaliações** — CRUD de APLs com 13 indicadores quantitativos e avaliação qualitativa
- **Comparar APLs** — Análise lado a lado entre arranjos
- **Modelo Teórico** — 15 condicionantes × 12 indicadores em 4 dimensões
- **Dados IBGE** — Integração com API de dados abertos do IBGE
- **Persistência JSON** — localStorage + export/import de arquivos `.json`

## Tópicos setoriais (casos conhecidos)

| Tópico | APLs de referência |
|--------|-------------------|
| Tecnologia da Informação | Tecnopuc (Porto Alegre/RS), Porto Digital (Recife/PE) |
| Agronegócio | Polo Leiteiro Zona da Mata (Viçosa/MG), Fruticultura Sul Catarinense (São Joaquim/SC) |
| Turismo Regional | Rota das Emoções (Jijoca/CE), Enoturismo Serra Gaúcha (Bento Gonçalves/RS) |
| Indústria Tradicional | Franca/SP, Blumenau/SC, Ubá/MG, Ceará-Mirim/RN |

Dados IBGE incluídos: população, PIB per capita, IDHM e indicador setorial por município.

## Dimensões analíticas

| Dimensão | Condicionantes |
|----------|----------------|
| Governança | Construção institucional, Estrutura de governança, Liderança |
| Cooperação | Cooperação, Confiança entre agentes, Eficiência coletiva |
| Inovação | Capacidade de competição, Desenvolvimento tecnológico, Criação de conhecimento |
| Impacto Socioeconômico | Emprego, Trajetória evolutiva, Tecido social, Mercados, Especialização |

## Como executar

O sistema usa módulos ES6 e `fetch` — é necessário um servidor local:

```bash
cd APL
npx serve .
```

Ou com Python:

```bash
cd APL
python -m http.server 8080
```

Acesse: `http://localhost:8080`

## Estrutura de dados

```
data/
├── modelo.json      # Estrutura teórica (condicionantes, indicadores, dimensões)
├── avaliacoes.json  # Seed com 4 APLs de exemplo (SP, SC, MG, RN)
└── estados.json     # UFs brasileiras e regiões
```

Persistência em `localStorage` (chave: `apl_avaliacoes_v1`).

## Imagens institucionais

Substitua os placeholders em `img/brand/`:
- `cabecalho.png` — banner do cabeçalho (1243×151)
- `logoNovoPng.png` — logotipo do rodapé (72px)

## Referência

Cardoso, A. F.; Mendonça, F. M. Modelo de avaliação desempenho de arranjos produtivos locais. In: *Sustentabilidade e Responsabilidade Social*, Vol. 1, Cap. 3, p. 25–40.
