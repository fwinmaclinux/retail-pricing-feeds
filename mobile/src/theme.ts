export const colors = {
  primary: '#0F5BD8',
  primaryPressed: '#0B47AA',
  primarySoft: '#E8F0FD',
  text: '#101828',
  textMuted: '#5B6577',
  textSubtle: '#8A93A3',
  border: '#E3E7EE',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  success: '#12805C',
  successSoft: '#E3F5EE',
  warning: '#B25E09',
  warningSoft: '#FDF1E3',
  danger: '#C4320A',
  dangerSoft: '#FDECE7',
  info: '#3E4FB8',
  infoSoft: '#ECEEFB',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };

export const font = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.textMuted, letterSpacing: 0.4 },
  mono: { fontSize: 12, fontFamily: 'Courier', color: colors.textMuted },
};
