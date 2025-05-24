export class MainCardIdHelper {
    // 解析主卡 ID 的各个部分
    static parseId(id: string | number): number[] {
        // 如果是数字类型，直接返回包含该数字的数组
        if (typeof id === 'number') {
            return [id];
        }
        // 如果是字符串类型，按 '-' 分割并转换为数字
        return id.split('-').map(part => parseInt(part));
    }

    // 生成新的兄弟主卡 ID
    static generateSiblingId(currentId: string, nextId: string | null): string {
        const currentParts = this.parseId(currentId);
        if (!nextId) {
            // 如果没有下一个兄弟，在当前 ID 的最后一个数字上加 10
            const lastPart = currentParts[currentParts.length - 1];
            currentParts[currentParts.length - 1] = lastPart + 10;
            return currentParts.join('-');
        }
        
        const nextParts = this.parseId(nextId);
        // 确保两个 ID 的层级相同
        if (currentParts.length !== nextParts.length) {
            throw new Error('当前主卡和下一个主卡的层级不同');
        }

        // 计算新 ID
        const lastPart = Math.floor((currentParts[currentParts.length - 1] + nextParts[nextParts.length - 1]) / 2);
        currentParts[currentParts.length - 1] = lastPart;
        return currentParts.join('-');
    }

    // 生成新的子主卡 ID
    static generateChildId(parentId: string, firstChildId: string | null): string {
        if (!firstChildId) {
            return parentId + '-10';
        }
        
        const parentParts = this.parseId(parentId);
        const childParts = this.parseId(firstChildId);
        
        // 确保子主卡确实是当前主卡的子主卡
        if (childParts.length !== parentParts.length + 1) {
            console.error('[ZK] 子主卡层级不正确', { parentParts, childParts });
            throw new Error('子主卡层级不正确');
        }
        // 取"0"和第一个子主卡编号的中间值
        const newChildId = Math.floor(childParts[childParts.length - 1] / 2);
        return parentId + '-' + newChildId;
    }
} 