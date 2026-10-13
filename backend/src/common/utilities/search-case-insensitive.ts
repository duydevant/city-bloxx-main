export const searchCaseInsensitive = (searchField: string): string => {
  return `LOWER(REPLACE(${searchField}, ' ', '')) LIKE LOWER(REPLACE(:keyword, ' ', ''))`;
};
