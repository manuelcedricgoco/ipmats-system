import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);
ChartJS.defaults.font.family = '"Public Sans", system-ui, sans-serif';
ChartJS.defaults.font.size = 12;
ChartJS.defaults.color = '#475569';
ChartJS.defaults.plugins.legend.labels.boxWidth = 10;
ChartJS.defaults.plugins.legend.labels.boxHeight = 10;

export const PALETTE = {
  brand: '#214c8a',
  brandLight: '#adc8e8',
  green: '#1f8a4c',
  yellow: '#d39b0b',
  red: '#c8372d',
  slate: '#94a3b8',
  accent: '#e9a110',
};
