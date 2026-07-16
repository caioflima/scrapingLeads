# Plano de Correção - Matriz de Scoring (Sem Site = Quente)

## Objetivo
O usuário notou que os leads sem site estão caindo na categoria "Frio" (já que a maioria ainda não tem redes sociais detectadas), e informou que na prática "se o lead não possui site ele deveria ser Quente e não Frio". 

Vamos ajustar o algoritmo para que **qualquer lead sem site** receba a pontuação necessária para ser classificado como 🔥 **Quente (70+)**, independentemente de já termos detectado suas redes sociais ou não.

## Alteração na Lógica de Pontuação (`prospeccao.html`)

Onde temos o recálculo do score:
```javascript
if (!hasWebsite) {
  prosScore += 60; // Dá o pulo garantido para Quente (60 + base = 70+)
} else if (hasWebsite) {
  prosScore += 30; // Mantém no nível Morno
} else {
  prosScore += 5; // (Este caso não ocorrerá mais, pois é !hasWebsite ou hasWebsite)
}
```

Dessa forma, os 146 leads mapeados que **não possuem site** irão imediatamente para a aba **Quentes (abordar já)**, recebendo scores acima de 70.

## Conclusão
O plano acima corrige a classificação garantindo que a ausência de site seja o gatilho principal para a alta temperatura do lead. Aguardo aprovação para aplicar.
