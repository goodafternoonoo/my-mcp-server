import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import axios from 'axios';

interface ExchangeRateApiInput {
    base: string; // 기준 통화 (예: KRW, USD, JPY 등)
    target: string; // 대상 통화 (예: USD, KRW, JPY 등)
}

interface ExchangeRateApiResponse {
    base: string;
    target: string;
    rate: number;
    date: string;
}

class ExchangeRateApiTool extends MCPTool<ExchangeRateApiInput> {
    name = 'exchange_rate_api';
    description =
        '무료 환율 API를 사용하여 기준 통화(base)에서 대상 통화(target)로의 환율을 조회합니다.';

    private readonly API_URL = process.env.EXCHANGE_RATE_API_URL || '';

    schema = {
        base: {
            type: z.string(),
            description: '기준 통화(예: KRW, USD, JPY 등)',
        },
        target: {
            type: z.string(),
            description: '대상 통화(예: USD, KRW, JPY 등)',
        },
    };

    async execute({
        base,
        target,
    }: ExchangeRateApiInput): Promise<ExchangeRateApiResponse> {
        try {
            const response = await axios.get(`${this.API_URL}${base}`);
            if (response.data.result !== 'success') {
                throw new Error('환율 데이터 조회 실패');
            }
            const rate = response.data.rates[target];
            if (rate === undefined) {
                throw new Error(
                    `대상 통화(${target})에 대한 환율 정보를 찾을 수 없습니다.`
                );
            }
            return {
                base,
                target,
                rate,
                date: response.data.time_last_update_utc,
            };
        } catch (error: any) {
            throw new Error(`환율 데이터 가져오기 실패: ${error.message}`);
        }
    }
}

export default ExchangeRateApiTool;
