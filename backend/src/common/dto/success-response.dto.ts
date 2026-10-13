import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuccessResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional()
  data?: T;

  @ApiPropertyOptional({ example: 'OK' })
  message?: string;
}

export class PaginatedDataDto<T> {
  @ApiProperty({ isArray: true })
  items: T[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 10 })
  totalPages: number;
}
