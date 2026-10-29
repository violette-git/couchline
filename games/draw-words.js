// Pictionary's words: everyday things that are easy to draw.

export const WORDS = `
apple, banana, pear, cherry, grapes, lemon, pineapple, watermelon, carrot, pumpkin, mushroom, corn,
pizza, burger, hot dog, sandwich, taco, cake, cupcake, cookie, donut, ice cream, popcorn, egg,
cheese, bread, candy, lollipop, cat, dog, fish, bird, snake, turtle, frog, rabbit, horse, cow, pig,
sheep, duck, chicken, owl, penguin, elephant, giraffe, lion, tiger, bear, monkey, zebra, whale,
dolphin, shark, octopus, crab, snail, spider, bee, butterfly, ladybug, ant, mouse, kangaroo, camel,
crocodile, flamingo, hedgehog, bat, squirrel, fox, deer, unicorn, dragon, dinosaur, jellyfish,
starfish, worm, house, tree, flower, sun, moon, star, cloud, rainbow, umbrella, chair, table, bed,
lamp, clock, key, door, window, ladder, book, pencil, scissors, glasses, hat, shoe, sock, shirt,
crown, ring, balloon, kite, ball, guitar, drum, piano, trumpet, bell, candle, cup, teapot, fork,
spoon, toothbrush, comb, mirror, phone, camera, computer, television, robot, rocket, airplane, car,
bus, train, bicycle, boat, ship, truck, tractor, helicopter, anchor, bridge, castle, tent,
lighthouse, mountain, volcano, island, beach, river, waterfall, snowman, igloo, fence, mailbox,
backpack, envelope, gift, trophy, map, compass, hammer, shovel, bucket, broom, basket, box, bottle,
soap, towel, bathtub, pillow, sofa, fridge, sink, vase, cactus, palm tree, leaf, acorn, feather,
nest, spider web, skateboard, surfboard, scooter, sled, swing, slide, wheel, magnet, battery,
light bulb, flashlight, campfire, ghost, skeleton, witch, wand, heart, diamond, arrow,
bow and arrow, target, sword, shield, pirate, mermaid, alien, astronaut, king, queen, princess,
clown, snowflake, lightning, tornado, sunflower, tulip, rose, dice, puzzle, bubble, chain,
headphones, microphone, violin, flag, tooth, eye, nose, ear, hand, foot
`.split(',').map((w) => w.trim()).filter(Boolean);
