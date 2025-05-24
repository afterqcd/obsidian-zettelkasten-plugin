// Canvas 相关的类型定义
export interface CanvasData {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    meta?: {
        rootCardId?: string;
    };
}

export interface CanvasNode {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    [key: string]: any;
}

export interface CanvasEdge {
    id: string;
    fromNode: string;
    toNode: string;
    fromSide: string;
    toSide: string;
    color?: string;
} 