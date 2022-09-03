class SatelliteOrbit {
    // ！所有角度参数均用rad表示！
    // gM：GM，引力常数×质量，参数需要查阅资料
    // sqrtA：长半轴开根
    // deltaN：平均角速度摄动值
    // toe：星历参考时刻
    // m0：平近点角
    // eccentricity：轨道偏心率
    // smallOmega：近地点角距
    // iDot：轨道倾角变化率
    // i0：轨道倾角
    // cUc、cUs：升交距角u的余弦及正弦调和改正项的振幅
    // cRc、cRs：卫星矢径r的余弦及正弦调和改正项的振幅
    // cIc、cIs：轨道倾角i的余弦及正弦调和改正项的振幅
    // bigOmega：参考时刻的升交点赤经
    // bigOmegaDot：升交点摄动
    // smallOmegaE：地球自转角速度
    constructor(
        gM,
        sqrtA,
        deltaN,
        toe,
        m0,
        eccentricity,
        smallOmega,
        iDot,
        i0,
        cUc,
        cUs,
        cRc,
        cRs,
        cIc,
        cIs,
        bigOmegaToe,
        bigOmegaDot,
        smallOmegaE
    ) {
        this.gM = gM;
        this.sqrtA = sqrtA;
        this.deltaN = deltaN;
        this.toe = toe;
        this.m0 = m0;
        this.eccentricity = eccentricity;
        this.smallOmega = smallOmega;
        this.iDot = iDot;
        this.i0 = i0;
        this.cUc = cUc;
        this.cUs = cUs;
        this.cRc = cRc;
        this.cRs = cRs;
        this.cIc = cIc;
        this.cIs = cIs;
        this.bigOmegaToe = bigOmegaToe;
        this.bigOmegaDot = bigOmegaDot;
        this.smallOmegaE = smallOmegaE;
    }

    // 牛顿迭代法求解E
    // 返回值：求解得到的E，float
    SolveE(eccentricity, eN, m) {
        return (
            eN -
            (eN - m - eccentricity * Math.sin(eN)) / (1 - eccentricity * Math.cos(eN))
        );
    }

    // 计算卫星在其轨道平面内的二维位置坐标，x轴指向天球x轴
    // 返回值：{ x : float , y : float }
    CalcSatelliteElipsePosition(deltaTime) {
        let n0 = Math.sqrt(this.gM) / Math.pow(this.sqrtA, 3);
        let n = n0 + this.deltaN;
        let m = this.m0 + n * deltaTime;

        // 计算En
        let eN = m;
        let eNPlus1 = this.SolveE(this.eccentricity, eN, m);
        while (eNPlus1 - eN > 0.000001) {
            eN = eNPlus1;
            eNPlus1 = this.SolveE(this.eccentricity, eNPlus1, m);
        }

        let f = Math.atan2(
            (Math.sqrt(1 - Math.pow(this.eccentricity, 2)) * Math.sin(eNPlus1)),
            (Math.cos(eNPlus1) - this.eccentricity)
        );
        let u = this.smallOmega + f;
        let rt =
            Math.pow(this.sqrtA, 2) * (1 - this.eccentricity * Math.cos(eNPlus1));
        let deltaU = this.cUc * Math.cos(2 * u) + this.cUs * Math.sin(2 * u);
        let deltaR = this.cRc * Math.cos(2 * u) + this.cRs * Math.sin(2 * u);
        let r = rt + deltaR;
        u += deltaU;
        return {
            x: r * Math.cos(u),
            y: r * Math.sin(u),
        };
    }

    // 计算卫星在真天球坐标系中的坐标
    // 返回值：{ x : float , y : float , z : float }
    CalcCelestialCoordinatePositionXYZ(deltaTime) {
        let n0 = Math.sqrt(this.gM) / Math.pow(this.sqrtA, 3);
        let n = n0 + this.deltaN;
        let m = this.m0 + n * deltaTime;

        // 计算En
        let eN = m;
        let eNPlus1 = this.SolveE(this.eccentricity, eN, m);
        while (eNPlus1 - eN > 0.000001) {
            eN = eNPlus1;
            eNPlus1 = this.SolveE(this.eccentricity, eNPlus1, m);
        }

        let bigOmega = this.bigOmegaToe + this.bigOmegaDot * deltaTime;

        let f = Math.atan2(
            (Math.sqrt(1 - Math.pow(this.eccentricity, 2)) * Math.sin(eNPlus1)),
            (Math.cos(eNPlus1) - this.eccentricity)
        );
        let u = this.smallOmega + f;
        let rt =
            Math.pow(this.sqrtA, 2) * (1 - this.eccentricity * Math.cos(eNPlus1));
        let it = this.i0 + this.iDot * deltaTime;
        let deltaU = this.cUc * Math.cos(2 * u) + this.cUs * Math.sin(2 * u);
        let deltaR = this.cRc * Math.cos(2 * u) + this.cRs * Math.sin(2 * u);
        let deltaI = this.cIc * Math.cos(2 * u) + this.cIs * Math.sin(2 * u);
        let r = rt + deltaR;
        u += deltaU;
        let i = it + deltaI;
        let x = r * Math.cos(u);
        let y = r * Math.sin(u);

        //这里是唯一与计算卫星在地球坐标系中的坐标有区别的地方
        let l = bigOmega;
        return {
            x: x * Math.cos(l) - y * Math.cos(i) * Math.sin(l),
            y: x * Math.sin(l) + y * Math.cos(i) * Math.cos(l),
            z: y * Math.sin(i),
        };
    }

    // 计算卫星在真地球坐标系中的坐标
    // 返回值：{ x : float , y : float , z : float }
    CalcEarthCoordinatePositionXYZ(deltaTime) {
        let n0 = Math.sqrt(this.gM) / Math.pow(this.sqrtA, 3);
        let n = n0 + this.deltaN;
        let m = this.m0 + n * deltaTime;

        // 计算En
        let eN = m;
        let eNPlus1 = this.SolveE(this.eccentricity, eN, m);
        while (eNPlus1 - eN > 0.000001) {
            eN = eNPlus1;
            eNPlus1 = this.SolveE(this.eccentricity, eNPlus1, m);
        }

        let bigOmega = this.bigOmegaToe + this.bigOmegaDot * deltaTime;

        let f = Math.atan2(
            (Math.sqrt(1 - Math.pow(this.eccentricity, 2)) * Math.sin(eNPlus1)),
            (Math.cos(eNPlus1) - this.eccentricity)
        );
        let u = this.smallOmega + f;
        let rt =
            Math.pow(this.sqrtA, 2) * (1 - this.eccentricity * Math.cos(eNPlus1));
        let it = this.i0 + this.iDot * deltaTime;
        let deltaU = this.cUc * Math.cos(2 * u) + this.cUs * Math.sin(2 * u);
        let deltaR = this.cRc * Math.cos(2 * u) + this.cRs * Math.sin(2 * u);
        let deltaI = this.cIc * Math.cos(2 * u) + this.cIs * Math.sin(2 * u);
        let r = rt + deltaR;
        u += deltaU;
        let i = it + deltaI;
        let x = r * Math.cos(u);
        let y = r * Math.sin(u);

        //这里是唯一与计算卫星在地球坐标系中的坐标有区别的地方
        let l = bigOmega - this.smallOmegaE * (deltaTime + this.toe);
        return {
            x: x * Math.cos(l) - y * Math.cos(i) * Math.sin(l),
            y: x * Math.sin(l) + y * Math.cos(i) * Math.cos(l),
            z: y * Math.sin(i),
        };
    }
}

export { SatelliteOrbit };