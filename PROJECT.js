import {
    init_unity_academy_2d,
    instantiate_sprite,
    set_position,
    apply_rigidbody,
    set_use_gravity,
    set_velocity,
    get_velocity,
    get_position,
    get_key,
    get_key_down,
    set_update,set_scale,set_rotation_euler,set_angular_velocity,set_start,
    vector3, get_x, get_y, get_z,destroy,on_collision_enter,
    get_main_camera_following_target, copy_position,translate_world,delta_time,add_impulse_force,
    remove_collider_components,gui_label,debug_log,same_gameobject
} from "unity_academy";

import {
  play,
  simultaneously,
  consecutively,
  sine_sound,
  triangle_sound,
  square_sound
} from "sound";

init_unity_academy_2d();

// any 函数
function any(pred, xs) {
    return is_null(xs)
        ? false
        : pred(head(xs)) || any(pred, tail(xs));
}

// === 状态变量 ===
let water_y = -5;
let water_speed = 0.1;
let water_timer = 0;
let water_start = false;
let in_water_time = 0;
let game_over = false;
let hp = 3;//初始生命值
let boost_timer = 0;//加速剩余时间
let boosted = false;
let is_speed_up=false;
let jump_count =2; 
let background_y = 7;
let score = 0;

//创建音效
const hurt_sound = consecutively(list(
  square_sound(880, 0.15),     // 高频尖锐感
  square_sound(660, 0.15),     // 下滑
  square_sound(440, 0.1),
  triangle_sound(330, 0.1),    // 破裂感
  simultaneously(list(         // 叠加噪声，持续0.3秒
    triangle_sound(220, 0.3),
    sine_sound(110, 0.3)
  ))
));

const mario_death = consecutively(list(
  square_sound(880.00, 0.3),      // A5
  square_sound(932.33, 0.3),      // A#5
  square_sound(987.77, 0.3),      // B5
  square_sound(1046.5, 0.3),      // C6
  square_sound(783.99, 0.3),      // G5
  square_sound(659.25, 0.3),      // E5
  square_sound(523.25, 0.3),      // C5
  simultaneously(list(            // 深沉尾音（更 NES 风格）
    triangle_sound(220.00, 1.6),  // A3
    triangle_sound(130.81, 1.6),  // C3
    triangle_sound(98.00, 1.6)    // G2
  ))
));

const jump_sound = consecutively(list(
  // 起跳音，快速上升感
  square_sound(660, 0.2),           // E5 较高频清脆

  // 爆发音，一次叠加高低频，制造冲击感
  simultaneously(list(
    triangle_sound(880, 0.3),       // 高频爆发
    sine_sound(110, 0.3)            // 低频冲击
  ))
));

const water_sound = simultaneously(list(
  triangle_sound(220, 0.1),  // 水下闷响
  sine_sound(880, 0.1)       // 高频“滴答”感
));

const speed_up = consecutively(list(
  square_sound(440, 0.1),   // A4
  square_sound(550, 0.1),   // C#5
  square_sound(659, 0.1),   // E5
  square_sound(784, 0.1),   // G5
  square_sound(880, 0.1)    // A5 - 顶点
));

const melody_once = consecutively(list(
  square_sound(659.25, 0.15),   // E5
  square_sound(659.25, 0.15),
  square_sound(659.25, 0.15),
  square_sound(523.25, 0.15),   // C5
  square_sound(659.25, 0.15),
  square_sound(783.99, 0.3),    // G5
  square_sound(392.00, 0.3),    // G4
  square_sound(523.25, 0.2),    // C5
  square_sound(392.00, 0.2),
  square_sound(329.63, 0.2),
  square_sound(440.00, 0.2),    // A4
  square_sound(466.16, 0.2),    // A#4
  square_sound(440.00, 0.2),    // A4
  square_sound(392.00, 0.15),
  square_sound(659.25, 0.15),
  square_sound(783.99, 0.15),
  square_sound(880.00, 0.15),
  square_sound(698.46, 0.3),
  square_sound(783.99, 0.3)
));

function repeat_melody(n) {
  return n === 0
    ? null
    : pair(melody_once, repeat_melody(n - 1));
}

const melody_loop = consecutively(repeat_melody(100));

play(melody_loop);

//创建背景图
const background = instantiate_sprite("https://raw.githubusercontent.com/wxy0429/NUS-SICP/refs/heads/main/background1.jpg");
remove_collider_components(background);
set_scale(background, vector3(2.3, 3.7, 1)); // 设置足够大，铺满屏幕
set_position(background, vector3(0, 7, 100)); // Z值最大，确保在最远处



// 记录所有平台砖块的位置（用于碰撞检测）
let all_tiles = null;

// 三种砖块贴图，均为小方格、支持跨域显示
const wall_images = list(
  "https://raw.githubusercontent.com/wxy0429/NUS-SICP/refs/heads/main/normal%20platform1.jpg",
  "https://raw.githubusercontent.com/wxy0429/NUS-SICP/refs/heads/main/durian3.png",
  "https://raw.githubusercontent.com/wxy0429/NUS-SICP/refs/heads/main/award%20platform2.jpg"
);


// 使用概率选择砖块贴图（5:3:2）
function random_wall_image_probabilistic() {
    const r = math_random();
    return r < 0.6
        ? list_ref(wall_images, 0)   // 50%
        : r < 0.75
        ? list_ref(wall_images, 1)   // 30%
        : list_ref(wall_images, 2);  // 20%
}

// 检查与已有墙是否重叠（包括边缘±1）
function is_overlapping_range(start_x, end_x, ranges) {
    return any(range => {
        const range_start = head(range);
        const range_end = tail(range);
        return !(end_x + 1 < range_start - 1 || start_x - 1 > range_end + 1);
    }, ranges);
}

// 生成单行墙体
function generate_ground_row(y, row_index) {
    const num_segments = 5 + math_floor(math_random() * 10); // 砖块段数
    let occupied_ranges = null;
    let count = 0;
    let attempt = 0;
  
    while (count < num_segments && attempt < 100) {
        const segment_length = 1 + math_floor(math_random() * 3); // 1~3格
        const max_x = 12 - segment_length;
        const start_x = -6 + math_floor(math_random() * (max_x + 1));
        const end_x = start_x + segment_length - 1;

        if (!is_overlapping_range(start_x, end_x, occupied_ranges)) {
            occupied_ranges = pair(pair(start_x, end_x), occupied_ranges);

            let i = 0;
            while (i < segment_length) {
                const x = start_x + i;
                const z = -row_index * 0.1;
                const url = random_wall_image_probabilistic();
                const tile = instantiate_sprite(url);
                const pos = vector3(x, y, z);
                set_scale(tile,vector3(0.5,0.5,0.5));
                set_position(tile, pos);
                all_tiles = pair(pair(pos,url), all_tiles);  // 记录砖块位置和类型
                i = i + 1;
            }

            count = count + 1;
        }

        attempt = attempt + 1;
    }
}

function generate_full_ground_row(y) {//生成最下面的一整排
    let x = -6;
    while (x <= 6) {
        const url = list_ref(wall_images, 0); // 第一种砖块;
        const z = 0;
        const tile = instantiate_sprite(url);
        const pos = vector3(x, y, z);
        set_position(tile, pos);
        set_scale(tile,vector3(0.5,0.5,0.5));
        all_tiles = pair(pair(pos, url), all_tiles);  // 记录砖块位置和类型
        x = x + 1;
    }
}

// 多行地图生成
function generate_map(num_rows,start_row_index) {
    let i = start_row_index;
    while (i < start_row_index + num_rows) {
        const y = i * 2.6;   //调整砖块行间距
        generate_ground_row(y, i);
        i = i + 1;
    }
}

// 调用函数生成
generate_full_ground_row(0);
generate_map(5,1);
let current_row_index = 5;  // 初始生成了前5行

// ===== 创建角色并设置初始位置和物理属性 =====

const player = instantiate_sprite("https://raw.githubusercontent.com/wxy0429/NUS-SICP/refs/heads/main/crab2.png");
const start_player = (gameObject) => {set_position(gameObject, vector3(0, 1, 0));
set_scale(gameObject, vector3(0.5, 0.5, 0.5));// 调整角色大小
apply_rigidbody(gameObject);
set_use_gravity(gameObject, true);}; // 人物受重力影响


// ===== 玩家控制逻辑 =====
function update_player(gameObject) {
    const base_speed = 4;
    const base_Speed = 4;
    const moveSpeed = boosted ? base_speed * 1.4 : base_speed;
    const jumpPower = 8.5;
    const extra_gravity = 9.8;
    const player_y = get_y(get_position(gameObject));
    add_impulse_force(gameObject, vector3(0, -extra_gravity *1.3* delta_time(), 0));
    
    //记录并显示得分
    score = score + delta_time();
    gui_label("Score: " + stringify(10 * math_floor(score)), 40,50);  // 左上角显示
    
    //保证玩家不旋转
    set_rotation_euler(gameObject, vector3(0, 0, 0));
    set_angular_velocity(gameObject, vector3(0, 0, 0));
    
    //摄像头跟随人物上下移动而不左右移动
    const cam = get_main_camera_following_target();
    const player_pos = get_position(player);
    const cam_y = get_y(player_pos);
    set_position(cam, vector3(0, cam_y, 5));
   
    //人物跳跃逻辑
    if (game_over){
        return 0;
    }

    // AD水平移动
    if (get_key("A")) {
        translate_world(gameObject, vector3(-delta_time() * moveSpeed, 0, 0));
    }
    if (get_key("D")) {
        translate_world(gameObject, vector3(delta_time() * moveSpeed, 0, 0));
    }
    
    
    // 获取垂直速度
    const vel_y = get_y(get_velocity(gameObject));
   

    //判断是否落地（当前和上一帧速度都接近 0）
    if (math_abs(vel_y) < 0.01) {
        jump_count = 2;
}   

    // 判断是否按下跳跃键，是否还有跳跃次数
    if (get_key_down("W") && jump_count > 0) {
        add_impulse_force(gameObject, vector3(0, jumpPower, 0));
        jump_count = jump_count - 1;
        play(jump_sound);
        }
     
  
 
    //砖块随人物移动动态生成   
    
    const new_row_index = math_floor(player_y / 2.6) + 2;
    if (new_row_index > current_row_index) {
        generate_ground_row(new_row_index * 2.6, new_row_index);
        current_row_index = new_row_index;
}
    
    // 如果玩家比背景高很多，让背景慢慢跟上来
    function update_background() {
    const player_y = get_y(get_position(player));
    if (player_y > background_y + 2) {
        background_y = background_y + (delta_time() * 2); // 控制速度
        set_position(background, vector3(0, background_y , 100));
        }
    }
    update_background();
   
}

//踩到不同砖块的反应
    function get_brick_url_from_gameobject(obj) {//是对all_tiles的搜索，找到站的是哪一个砖块
      function search(tiles) {
        if (is_null(tiles)) {
            return null;
        }
        const brick_pos = head(head(tiles));
        const obj_pos = get_position(obj);
        
        if (math_abs(get_x(brick_pos) - get_x(obj_pos)) < 0.3 &&
            math_abs(get_y(brick_pos) - get_y(obj_pos)) < 0.3) {
            return tail(head(tiles));
        } else {
            return search(tail(tiles));
        }
    }
    return search(all_tiles);
}


function handle_player_collision(self, other) {
const url = get_brick_url_from_gameobject(other);


  if (!is_null(url)) {
    // 第二种砖块：扣血砖块
    if (url === list_ref(wall_images, 1)) {
      hp = hp - 1;
      play(hurt_sound);
      //gui_label("HP: " + stringify(hp), 50, 50);
      add_impulse_force(self, vector3(0, 8, 0)); // 被弹起来

      if (hp <= 0 && !game_over) {
        game_over = true;
        set_update(player, x => {});
        set_rotation_euler(player, vector3(0, 0, 90));
        set_velocity(player, vector3(0, 0, 0));
        const screen = instantiate_sprite("https://raw.githubusercontent.com/wxy0429/NUS-SICP/refs/heads/main/game%20over.png");
        set_position(screen, vector3(0, get_y(get_position(player)), -1000));              // 保证在最前面
        set_scale(screen, vector3(1, 1, 1));
      }
    }

    // 第三种砖块：加速砖块
    if (url === list_ref(wall_images, 2)) {
        boosted = true;// 加速n秒
        boost_timer = 0.8; 
        play(speed_up);
    
}
//加速逻辑
if (boosted) {
    boost_timer = boost_timer - delta_time();
    if (boost_timer <= 0) {
        boosted = false;
    }
}
  }
}


// === 创建水对象 ===
const water = instantiate_sprite("https://raw.githubusercontent.com/wxy0429/NUS-SICP/refs/heads/main/wave1.png");
const start_water = (gameObject) => {
    set_position(gameObject, vector3(0, -5, -100));
    remove_collider_components(gameObject);//水移除刚体
    set_scale(gameObject, vector3(1.6, 1.8, 1));
};


function update_water(gameObject) {
    if (game_over) {
        return 0;
    }

    // 等待 5 秒后水开始蔓延
    water_timer = water_timer + delta_time();
    if (water_timer > 5) {
        water_start = true;
    }

    // 水的向上爬升
    if (water_start) {
        water_speed = water_speed + 0.0004; // 蔓延速度递增
        translate_world(gameObject, vector3(0, delta_time() * water_speed, 0));
    }

    // 获取 player 的高度
    const player_y = get_y(get_position(player));

    // 检测玩家是否进入水中
    if (player_y < get_y(get_position(gameObject)) + 2.5) {
        in_water_time = in_water_time + delta_time();
        play(water_sound);
        
    // 模拟浮力：给玩家一个小的向上力
    const upward_buoyancy = 0.3;  // 调整这个值改变浮力
    if (in_water_time > 0.4){
    add_impulse_force(player, vector3(0, upward_buoyancy, 0));
        }
    
    } else {
        in_water_time = 0;
    }

    // 玩家在水中超过 5 秒 Game Over
    if (in_water_time > 5 && !game_over) {
    game_over = true;
    play(mario_death);

    // 停止玩家 update
    set_update(player, x => {});

    // 让角色横过来，像死掉了
    set_rotation_euler(player, vector3(0, 0, 90));           // 横过来
    set_angular_velocity(player, vector3(0, 0, 0));          // 停止旋转
    set_velocity(player, vector3(0, 0, 0));                  // 停止移动

    // 加载黑屏（可选）
    const screen = instantiate_sprite("https://raw.githubusercontent.com/wxy0429/NUS-SICP/refs/heads/main/game%20over.png");
    set_position(screen, vector3(0, player_y, -1000));              // 保证在最前面
    set_scale(screen, vector3(1, 1, 1));
    display("DROWNED");
    }
}




//set start和update放最后
set_start(player,start_player);
set_start(water,start_water);
set_update(player, update_player);
set_update(water,update_water);
on_collision_enter(player, handle_player_collision);