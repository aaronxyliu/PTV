# Convert data from database to json for extension use

import json
from PS_conn import connect_to_planetscale

connection = connect_to_planetscale()
cursor = connection.cursor()

TRIM_SIZE = 5
# TABLE NAMEs
COM_TREE_TABLE = f'ComPT_5_{TRIM_SIZE}'
FILE_TABLE = 'DetectFile'

def toJson1():
    cursor.execute(f"SELECT root_name, content FROM {COM_TREE_TABLE};")
    res = cursor.fetchall()

    pt_dict = {}
    for entry in res:
        pt_dict[entry[0]] = json.loads(entry[1])
    with open(f'data/pts_{TRIM_SIZE}.json', "w") as outfile:
        outfile.write(json.dumps(pt_dict))

def toJson2():
    cursor.execute(f"SELECT libname, filename, url, version, in_deps, out_deps, comment, id FROM {FILE_TABLE};")
    res = cursor.fetchall()

    file_dict = {}
    for entry in res:
        if entry[6]:
            # Skip module
            continue
        file_dict[entry[7]] = {
            'libname': entry[0],
            'filename': entry[1],
            'url': entry[2],
            'version': entry[3],
            'in_deps': json.loads(entry[4]) if entry[4] else [],
            'out_deps': json.loads(entry[5]) if entry[5] else [],
        }
    
    with open('data/DetectFile.json', "w") as outfile:
        outfile.write(json.dumps(file_dict))

if __name__ == '__main__':
    toJson1()
    #toJson2()
    print('Complete')
    
