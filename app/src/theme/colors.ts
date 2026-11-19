// Brand palettes, see docs/identite-visuelle.md
export type ColorPalette = {
  background: string;
  card: string;
  border: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  link: string;
  momentum: string;
  text: string;
  textSecondary: string;
  textBody: string;
  logoEdge: string;
  logoLines: string;
};

export const lightColors: ColorPalette = {
  background: '#F3F5FB',
  card: '#FFFFFF',
  border: '#D5DBEC',
  primary: '#2F5BFF',
  primaryPressed: '#1C3FD1',
  onPrimary: '#FFFFFF',
  link: '#2F5BFF',
  momentum: '#FF5A1F',
  text: '#0B1B3F',
  textSecondary: '#4A5578',
  textBody: '#4A5578',
  logoEdge: '#2F5BFF',
  logoLines: '#2F5BFF',
};

export const darkColors: ColorPalette = {
  background: '#0A1230',
  card: '#131C40',
  border: '#26315C',
  // Primary button stays #2F5BFF with white text in both themes
  primary: '#2F5BFF',
  primaryPressed: '#1C3FD1',
  onPrimary: '#FFFFFF',
  link: '#8FA6FF',
  momentum: '#FF5A1F',
  text: '#F3F5FB',
  textSecondary: '#A9B3D1',
  textBody: '#CDD4EA',
  logoEdge: '#8FA6FF',
  logoLines: '#5B7CFF',
};
