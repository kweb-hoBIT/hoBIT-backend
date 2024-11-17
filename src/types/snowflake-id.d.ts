declare module 'snowflake-id' {
  export default class SnowflakeID {
    constructor(options: { mid: number });
    generate(): number;
  }
}