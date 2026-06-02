declare module 'all-the-cities' {
  interface City {
    cityId: number;
    name: string;
    altName: string;
    country: string;
    featureCode: string;
    adminCode: string;
    population: number;
    loc: { type: string; coordinates: [number, number] };
  }
  const cities: City[];
  export default cities;
}
