import React from 'react'
import { t } from '../../../i18n'

/** Roteiro de viagem: ainda não implementado — página descreve a ideia. */
export function ItineraryPage(): React.ReactElement {
  const muted: React.CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }
  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>🧭</span>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('travel.roteiro')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('travel.monteORoteiroDaViagem')}
          </p>
        </div>
      </div>

      <div className="chart-section">
        <div className="chart-title">{t('travel.aindaVaiSerImplementado')}</div>
        <p style={{ ...muted, marginTop: 8 }}>
          {t('travel.aIdeiaEVoceCadastrar')}
        </p>
        <ul style={{ ...muted, marginTop: 8, paddingLeft: 18 }}>
          <li>{t('travel.listaDePontosQueVoce')}</li>
          <li>{t('travel.rotasEMeiosDeTransporte')}</li>
          <li>
            {t('travel.estimativaDePrecoDeUber')}
          </li>
          <li>{t('travel.horariosPossiveisFrequenciaPrimeiroUltimo')}</li>
          <li>{t('travel.roteiroFinalMontadoPelaIa')}</li>
        </ul>
        <p style={{ ...muted, marginTop: 12, fontStyle: 'italic' }}>
          {t('travel.notaDeApoioAoDesenvolvimento')}
        </p>
      </div>
    </div>
  )
}
