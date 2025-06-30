import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

interface TransitApiInput {
    originLat: number; // 출발지 위도
    originLng: number; // 출발지 경도
    destLat: number; // 도착지 위도
    destLng: number; // 도착지 경도
}

interface TransitApiResponse {
    summary: string; // 경로 요약
    duration: number; // 소요 시간(초)
    distance: number; // 총 거리(미터)
    transfers: number; // 환승 횟수
    fare: number; // 예상 요금(원)
    path: string[]; // 주요 경유지 요약
}

class TransitApiTool extends MCPTool<TransitApiInput> {
    name = 'transit_api';
    description =
        '티맵 대중교통 API를 사용하여 출발지~도착지(위도/경도) 대중교통 경로를 안내합니다.';

    private readonly API_URL = process.env.TMAP_TRANSIT_API_URL || '';
    private readonly API_KEY = process.env.TMAP_TRANSIT_API_KEY || '';

    schema = {
        originLat: {
            type: z.number(),
            description: '출발지 위도',
        },
        originLng: {
            type: z.number(),
            description: '출발지 경도',
        },
        destLat: {
            type: z.number(),
            description: '도착지 위도',
        },
        destLng: {
            type: z.number(),
            description: '도착지 경도',
        },
    };

    async execute({
        originLat,
        originLng,
        destLat,
        destLng,
    }: TransitApiInput): Promise<any> {
        try {
            console.log('[TransitApiTool] 요청 시작:', {
                originLat,
                originLng,
                destLat,
                destLng,
            });
            const response = await axios.post(
                this.API_URL,
                {
                    startX: originLng,
                    startY: originLat,
                    endX: destLng,
                    endY: destLat,
                    count: 1, // 최적 경로 1개만 반환
                    lang: 0, // 한국어
                    format: 'json',
                },
                {
                    headers: {
                        appKey: this.API_KEY,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000, // 10초
                }
            );
            console.log('[TransitApiTool] 응답 성공:', response.data);

            const plan = response.data?.metaData?.plan;
            if (!plan || !plan.itineraries || plan.itineraries.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: '경로를 찾을 수 없습니다.',
                        },
                    ],
                };
            }
            const best = plan.itineraries[0];

            // 소요 시간(초 → 분)
            const durationMin = best.totalTime
                ? Math.round(best.totalTime / 60)
                : undefined;
            // 환승 횟수
            const transfers = best.transferCount ?? 0;
            // 총 거리(미터 → km)
            const distanceKm = best.totalDistance
                ? (best.totalDistance / 1000).toFixed(1)
                : undefined;
            // 총 도보 거리(미터 → m)
            const walkDistance = best.totalWalkDistance ?? 0;
            // 총 도보 시간(초 → 분)
            const walkTimeMin = best.totalWalkTime
                ? Math.round(best.totalWalkTime / 60)
                : undefined;
            // 요금
            const fare = best.fare?.regular?.totalFare ?? 0;
            // legs(경유지)
            const legs = best.legs || [];
            const stops = legs
                .map((leg: any) => {
                    if (leg.mode === 'WALK') return '도보';
                    if (leg.route) return leg.route;
                    return leg.mode;
                })
                .join(' → ');

            // 상세 legs 정보 요약 (상세 경유지)
            const legsDetail = legs
                .map((leg: any, idx: number) => {
                    let desc = `[${idx + 1}] `;
                    // 출발/도착지 이름
                    const startName = leg.start?.name ? leg.start.name : '';
                    const endName = leg.end?.name ? leg.end.name : '';
                    if (leg.mode === 'WALK') {
                        desc += `도보 (${leg.distance}m, 약 ${Math.round(
                            (leg.sectionTime || 0) / 60
                        )}분)\n`;
                        if (startName) desc += `    - 출발: ${startName}\n`;
                        if (endName) desc += `    - 도착: ${endName}\n`;
                        // 도보 상세
                        if (leg.steps && Array.isArray(leg.steps)) {
                            desc += leg.steps
                                .map(
                                    (step: any) =>
                                        `    · ${step.description || ''}`
                                )
                                .join('\n');
                            desc += '\n';
                        }
                    } else {
                        // 대중교통 구간(지하철/버스 등)
                        desc += `${leg.mode}`;
                        if (leg.route) desc += `(${leg.route})`;
                        desc += ` - ${leg.distance}m, 약 ${Math.round(
                            (leg.sectionTime || 0) / 60
                        )}분\n`;
                        if (startName) desc += `    - 승차: ${startName}\n`;
                        if (endName) desc += `    - 하차: ${endName}\n`;
                        // 노선/방향 정보
                        if (
                            leg.Lane &&
                            Array.isArray(leg.Lane) &&
                            leg.Lane.length > 0
                        ) {
                            const lane = leg.Lane[0];
                            if (lane.route)
                                desc += `    - 노선: ${lane.route}\n`;
                            if (lane.type)
                                desc += `    - 노선타입: ${lane.type}\n`;
                            if (lane.service !== undefined)
                                desc += `    - 운행여부: ${
                                    lane.service === 1 ? '운행중' : '운행종료'
                                }\n`;
                        }
                        // 경유 정류장/역
                        if (
                            leg.passStopList &&
                            leg.passStopList.stationList &&
                            Array.isArray(leg.passStopList.stationList)
                        ) {
                            const stations = leg.passStopList.stationList
                                .map((station: any) => station.stationName)
                                .filter(Boolean);
                            if (stations.length > 0) {
                                desc += `    - 경유지: ${stations.join(
                                    ' → '
                                )}\n`;
                            }
                        }
                    }
                    return desc.trim();
                })
                .join('\n\n');

            return {
                content: [
                    {
                        type: 'text',
                        text:
                            `경로 요약: ${stops}\n` +
                            (durationMin !== undefined
                                ? `소요 시간: 약 ${durationMin}분\n`
                                : '') +
                            `환승: ${transfers}회\n` +
                            (fare ? `요금: ${fare}원\n` : '') +
                            (distanceKm ? `총 거리: ${distanceKm}km\n` : '') +
                            (walkDistance
                                ? `총 도보 거리: ${walkDistance}m\n`
                                : '') +
                            (walkTimeMin !== undefined
                                ? `총 도보 시간: 약 ${walkTimeMin}분\n`
                                : '') +
                            `\n[상세 경유지]\n${legsDetail}`,
                    },
                ],
            };
        } catch (error: any) {
            console.error(
                '[TransitApiTool] 에러 발생:',
                error,
                error?.response?.data
            );
            return {
                content: [
                    {
                        type: 'text',
                        text: `대중교통 경로 조회 실패: ${error.message}`,
                    },
                ],
            };
        }
    }
}

export default TransitApiTool;
