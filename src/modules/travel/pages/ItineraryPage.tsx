import React from 'react'

/** Roteiro de viagem: ainda não implementado — página descreve a ideia. */
export function ItineraryPage(): React.ReactElement {
  const muted: React.CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }
  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>🧭</span>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Roteiro</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Monte o roteiro da viagem a partir dos lugares que você quer visitar
          </p>
        </div>
      </div>

      <div className="chart-section">
        <div className="chart-title">🚧 Ainda vai ser implementado</div>
        <p style={{ ...muted, marginTop: 8 }}>
          A ideia é você cadastrar aqui os pontos que quer visitar e a IA consultar o Google Maps
          para ver as possibilidades de deslocamento entre eles (trem, ônibus, a pé, carro), os
          horários disponíveis de cada opção e, a partir disso, montar o roteiro.
        </p>
        <ul style={{ ...muted, marginTop: 8, paddingLeft: 18 }}>
          <li>Lista de pontos que você quer ir.</li>
          <li>Rotas e meios de transporte entre os pontos via Google Maps.</li>
          <li>
            Estimativa de preço de Uber entre os pontos, se a Uber oferecer API de cálculo de
            preço.
          </li>
          <li>Horários possíveis (frequência, primeiro/último horário, intervalos sem serviço).</li>
          <li>Roteiro final montado pela IA, encaixando os pontos nos horários viáveis.</li>
        </ul>
        <p style={{ ...muted, marginTop: 12, fontStyle: 'italic' }}>
          Nota de apoio ao desenvolvimento da ideia: caso de Kumamoto da estátua do Franky que
          tinha trem de hora em hora, mas às 15:30 parava e só voltava às 18.
        </p>
      </div>
    </div>
  )
}
